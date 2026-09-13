"use client";
import { useEffect, useState, useRef, type RefObject } from "react";
import { canRecover, createRecoveryBudget, MeasurementError } from "@/lib/presage/recovery";
import type { CaptureContext, CaptureStats, VitalsView } from "@/lib/presage/types";
const EMPTY: VitalsView = { serverNow: 0, validation: { code: null, hint: "" }, available: false, sessionId: null, status: "off", message: "Starts with your camera", startedAt: null, latest: null, baseline: { pulse: null, breathing: null }, history: [], events: [] };

/** Capture from the visible preview owned by useTells; never open another camera/video. */
export function usePresage(code: string, token: string, preview: RefObject<HTMLVideoElement | null>, active: boolean, contextRef?: RefObject<CaptureContext | null>) {
  const [receivedAt, setReceivedAt] = useState(0);
  const [view, setView] = useState<VitalsView>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [captureStats, setCaptureStats] = useState<CaptureStats>({ fps: 0, encoded: 0, dropped: 0, encodeMs: 0, uploadMs: 0, queued: 0, width: 0, height: 0 });
  const [fps, setFps] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const url = `/api/table/${code}/vitals`;
  const teardown = useRef<Promise<unknown>>(Promise.resolve());
  const recovery = useRef({ key: "", nextDelay: createRecoveryBudget() });
  useEffect(() => {
    const key = `${url}:${token}:${active}`;
    if (recovery.current.key !== key) recovery.current = { key, nextDelay: createRecoveryBudget() };
    let cancelled = false, sessionId = "", timer: ReturnType<typeof setInterval> | undefined, restartTimer: ReturnType<typeof setTimeout> | undefined, frameId = 0;
    let video: HTMLVideoElement | null = null, encoding = false, sending = false, stopped = false, frameCallbacks = true;
    let lastMediaTime = -1, lastPresented = -1, count = 0, countedAt = performance.now(), backloggedAt = 0, lastPoll = 0, lastCapturedAt = performance.now();
    const queue: Uint8Array[] = [];
    const stats: CaptureStats = { fps: 0, encoded: 0, dropped: 0, encodeMs: 0, uploadMs: 0, queued: 0, width: 0, height: 0 };
    const controller = new AbortController();
    const headers = { Authorization: `Bearer ${token}` };
    const stopRemote = () => {
      if (!sessionId) return teardown.current;
      teardown.current = fetch(url, { method: "DELETE", headers: { ...headers, "X-Vitals-Session": sessionId }, keepalive: true, signal: AbortSignal.timeout(8000) }).catch(() => {});
      return teardown.current;
    };
    const cancelCapture = () => {
      if (frameCallbacks && video?.cancelVideoFrameCallback) video.cancelVideoFrameCallback(frameId);
      else cancelAnimationFrame(frameId);
    };
    const fail = (err: unknown) => {
      if (cancelled || stopped) return;
      stopped = true; queue.length = 0; cancelCapture();
      if (timer) clearInterval(timer);
      const delay = active ? recovery.current.nextDelay(canRecover(err)) : null;
      const message = delay !== null ? "Reconnecting measurements…" : err instanceof Error ? err.message : "Measurements are unavailable.";
      setError(delay !== null ? null : message); setFps(0);
      setView(v => ({ ...v, status: delay !== null ? "starting" : "error", latest: null, message }));
      void stopRemote();
      if (delay !== null) restartTimer = setTimeout(() => { if (!cancelled) setAttempt(n => n + 1); }, delay);
    };
    const request = async (init: RequestInit) => {
      const response = await fetch(url, { ...init, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
      const result = await response.json();
      if (!response.ok) throw new MeasurementError(result.error ?? "Measurements are unavailable.", result.retryable === true || (result.retryable === undefined && response.status >= 500));
      return result as VitalsView;
    };
    async function run() {
      try {
        await teardown.current;
        if (cancelled) return;
        const data = await request({ method: active ? "POST" : "GET", headers });
        sessionId = data.sessionId ?? "";
        const clockOffset = data.serverNow - (performance.timeOrigin + performance.now());
        if (cancelled) { if (active) void stopRemote(); return; }
        setReceivedAt(performance.now()); setView(data); setError(null); setFps(0); setCaptureStats({ ...stats });
        if (!active || !sessionId) return;
        lastCapturedAt = performance.now();
        const canvas = document.createElement("canvas"), context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new MeasurementError("Camera frames are unavailable in this browser.", false);
        function capture(now: number, metadata?: VideoFrameCallbackMetadata) {
          if (cancelled || stopped || !video || preview.current !== video) return;
          frameId = frameCallbacks ? video.requestVideoFrameCallback(capture) : requestAnimationFrame(capture);
          const mediaTime = metadata?.mediaTime ?? video.currentTime;
          // currentTime can advance between real frames during the RAF fallback.
          // Prefer the browser's frame count so a 30-fps camera is not duplicated at 60 Hz.
          const quality = !metadata && video.getVideoPlaybackQuality?.();
          const presented = metadata?.presentedFrames ?? (quality && quality.totalVideoFrames > 0 ? quality.totalVideoFrames - quality.droppedVideoFrames : undefined);
          if (presented !== undefined && presented === lastPresented) return;
          if (presented !== undefined) lastPresented = presented;
          // Deduplicate real source frames, not callback arrival intervals (which can jitter).
          if (video.readyState < 2 || mediaTime === lastMediaTime || !video.videoWidth) return;
          if (encoding) { stats.dropped++; lastMediaTime = mediaTime; return; }
          const encodeStarted = performance.now();
          lastMediaTime = mediaTime; encoding = true;
          const scale = Math.min(1, 640 / video.videoWidth, 480 / video.videoHeight);
          const width = Math.round(video.videoWidth * scale), height = Math.round(video.videoHeight * scale);
          if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
          const captureAt = performance.timeOrigin + (metadata?.captureTime ?? now) + clockOffset;
          context!.drawImage(video, 0, 0, width, height);
          canvas.toBlob(async blob => {
            try {
              if (!blob || cancelled || stopped) return;
              const jpeg = new Uint8Array(await blob.arrayBuffer());
              if (cancelled || stopped) return;
              const frame = new Uint8Array(jpeg.length + 12), header = new DataView(frame.buffer);
              header.setUint32(0, jpeg.length, true); header.setFloat64(4, captureAt, true); frame.set(jpeg, 12);
              queue.push(frame); if (queue.length > 12) { queue.shift(); stats.dropped++; }
              stats.encoded++; stats.encodeMs = Math.round(performance.now() - encodeStarted); stats.width = width; stats.height = height;
              lastCapturedAt = performance.now(); count++;
              if (now - countedAt >= 2000) { stats.fps = Math.round(count * 1000 / (now - countedAt)); stats.queued = queue.length; setFps(stats.fps); setCaptureStats({ ...stats }); count = 0; countedAt = now; }
            } catch (err) { fail(err); }
            finally { encoding = false; }
          }, "image/jpeg", 0.95);
        }
        async function tick() {
          if (cancelled || stopped) return;
          if (video !== preview.current) {
            cancelCapture(); video = preview.current; lastMediaTime = -1; lastPresented = -1;
            frameCallbacks = !!video?.requestVideoFrameCallback;
            if (video) frameId = frameCallbacks ? video.requestVideoFrameCallback(capture) : requestAnimationFrame(capture);
          }
          if (document.hidden) { queue.length = 0; lastCapturedAt = performance.now(); return; }
          // Browsers may stop presentation callbacks when the mobile sidebar is hidden.
          // Read the same live source on animation frames rather than repeatedly restarting it.
          if (video && frameCallbacks && performance.now() - lastCapturedAt > 750) {
            cancelCapture(); frameCallbacks = false; lastPresented = -1; frameId = requestAnimationFrame(capture);
          }
          if (performance.now() - lastCapturedAt > 6000) { fail(new MeasurementError("Camera frames stopped arriving. Check the connection and try again.", true)); return; }
          if (sending) return;
          if (!queue.length && performance.now() - lastPoll < 2000) return;
          sending = true; lastPoll = performance.now();
          try {
            let result: VitalsView;
            if (queue.length) {
              const batch = queue.splice(0), bytes = new Uint8Array(batch.reduce((sum, f) => sum + f.length, 0));
              let offset = 0; for (const f of batch) { bytes.set(f, offset); offset += f.length; }
              const uploadStarted = performance.now();
              const context = contextRef?.current;
              const hint: Record<string, string> = context && Date.now() - context.at < 1000 ? { "X-Vitals-Context": JSON.stringify({ ...context, at: context.at + clockOffset }) } : {};
              result = await request({ method: "PUT", headers: { ...headers, "Content-Type": "application/octet-stream", "X-Vitals-Session": sessionId, ...hint }, body: bytes });
              stats.uploadMs = Math.round(performance.now() - uploadStarted);
            } else result = await request({ method: "GET", headers });
            if (result.status === "stopped" || result.status === "off") throw new MeasurementError("Camera processing disconnected.", true);
            if (result.status === "error") throw new MeasurementError(result.message, result.retryable ?? true);
            if (result.message.includes("catching up")) {
              backloggedAt ||= performance.now();
              if (performance.now() - backloggedAt > 10_000) throw new MeasurementError("Camera processing is not keeping up.", true);
            } else backloggedAt = 0;
            if (!cancelled && !stopped) { setReceivedAt(performance.now()); setView(result); }
          } catch (err) { fail(err); }
          finally { sending = false; }
        }
        void tick(); timer = setInterval(() => void tick(), 200);
      } catch (err) { fail(err); }
    }
    void run();
    return () => {
      cancelled = true; controller.abort(); queue.length = 0;
      if (timer) clearInterval(timer);
      if (restartTimer) clearTimeout(restartTimer);
      cancelCapture();
      // useTells owns the shared video and MediaStream; measurement cleanup must not pause either.
      if (active) void stopRemote();
    };
  }, [url, token, preview, active, attempt, contextRef]);
  return { view, error, fps, captureStats, receivedAt };
}
