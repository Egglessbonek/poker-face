"use client";

/**
 * Client-side tell pipeline: webcam -> FaceLandmarker -> TellFrames (buffered) -> baseline / snapshots.
 *
 * - Detection runs every video frame; TellFrames are sampled into the buffer at ~4Hz.
 * - `calibrate()` collects 10s of frames and computes the baseline.
 * - `snapshot(sinceMs, extras)` builds a TellSnapshot for the decision window that started at `sinceMs`.
 * - `markReveal(event)` records card reveals so reactions in the next 1.5s can be scored.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getFaceLandmarker, startDetectionLoop } from "@/lib/tells/landmarker";
import { createFeatureState, extractFrame } from "@/lib/tells/features";
import { CALIBRATION_MS, computeBaseline, updateLatencyBaseline } from "@/lib/tells/baseline";
import type { BaselineStats, CursorStats, Street, TellFrame, TellSnapshot, VoiceStats } from "@/lib/types";

export type CameraStatus = "idle" | "starting" | "running" | "denied" | "error";
type RevealEvent = TellSnapshot["cardRevealReactions"][number]["event"];

const SAMPLE_MS = 250;
const BUFFER_MS = 120_000;
const REACTION_WINDOW_MS = 1500;

export function useTells() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  /** Callback ref: re-attaches the live stream whenever the <video> element (re)mounts. */
  const attachVideo = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (el && stream.current && el.srcObject !== stream.current) {
      el.srcObject = stream.current;
      el.play().catch(() => {});
    }
  }, []);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [frame, setFrame] = useState<TellFrame | null>(null);
  const [baseline, setBaseline] = useState<BaselineStats | null>(null);
  const [calibrating, setCalibrating] = useState<{ startedAt: number; progress: number } | null>(null);
  /** Human-readable summary of what the camera saw during calibration, for the player to sanity-check. */
  const [calibrationReport, setCalibrationReport] = useState<string | null>(null);

  const buffer = useRef<TellFrame[]>([]);
  const reveals = useRef<Array<{ event: RevealEvent; t: number }>>([]);
  const stopLoop = useRef<() => void>(() => {});
  const baselineRef = useRef<BaselineStats | null>(null);

  const start = useCallback(async () => {
    if (status === "running" || status === "starting") return;
    setStatus("starting");
    try {
      const video = videoRef.current;
      if (!video) throw new Error("video element not mounted");
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" }, audio: false });
      stream.current = s;
      video.srcObject = s;
      await video.play();
      const landmarker = await getFaceLandmarker();
      const fstate = createFeatureState();
      let lastSample = 0;
      stopLoop.current = startDetectionLoop(() => videoRef.current, landmarker, (result, ts) => {
        const now = Date.now();
        const f = extractFrame(result, now, fstate);
        if (ts - lastSample >= SAMPLE_MS) {
          lastSample = ts;
          buffer.current.push(f);
          const cutoff = now - BUFFER_MS;
          while (buffer.current.length && buffer.current[0].t < cutoff) buffer.current.shift();
          setFrame(f);
        }
      });
      setStatus("running");
    } catch (err) {
      console.error("camera start failed", err);
      setStatus((err as DOMException)?.name === "NotAllowedError" ? "denied" : "error");
    }
  }, [status]);

  const stop = useCallback(() => {
    stopLoop.current();
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setStatus("idle");
  }, []);

  useEffect(() => () => stop(), [stop]);

  /** Collect CALIBRATION_MS of frames, then compute and store the baseline. Resolves with it. */
  const calibrate = useCallback(async (): Promise<BaselineStats> => {
    const startedAt = Date.now();
    setCalibrating({ startedAt, progress: 0 });
    await new Promise<void>((resolve) => {
      const tick = () => {
        const p = Math.min(1, (Date.now() - startedAt) / CALIBRATION_MS);
        setCalibrating({ startedAt, progress: p });
        if (p >= 1) resolve();
        else setTimeout(tick, 100);
      };
      tick();
    });
    const frames = buffer.current.filter((f) => f.t >= startedAt);
    const b = computeBaseline(frames);
    baselineRef.current = b;
    setBaseline(b);
    setCalibrating(null);
    const faceFrames = frames.filter((f) => f.facePresent).length;
    const facePct = frames.length ? Math.round((faceFrames / frames.length) * 100) : 0;
    const gazes = frames.reduce<Record<string, number>>((acc, f) => ((acc[f.gaze] = (acc[f.gaze] ?? 0) + 1), acc), {});
    const topGaze = Object.entries(gazes).sort((x, y) => y[1] - x[1])[0]?.[0] ?? "unknown";
    setCalibrationReport(`face in ${facePct}% of frames, ~${Math.round(b.blinkRate)} blinks/min, mostly looking at ${topGaze}`);
    return b;
  }, []);

  const markReveal = useCallback((event: RevealEvent) => {
    reveals.current.push({ event, t: Date.now() });
    reveals.current = reveals.current.slice(-8);
  }, []);

  const noteLatency = useCallback((latencyMs: number) => {
    if (!baselineRef.current) return;
    baselineRef.current = updateLatencyBaseline(baselineRef.current, latencyMs);
    setBaseline(baselineRef.current);
  }, []);

  const snapshot = useCallback(
    (sinceMs: number, extras: { handNumber: number; street: Street; decisionLatencyMs: number; cursor?: CursorStats; voice?: VoiceStats }): TellSnapshot => {
      const frames = buffer.current.filter((f) => f.t >= sinceMs);
      const cardRevealReactions = reveals.current
        .filter((r) => r.t >= sinceMs - REACTION_WINDOW_MS)
        .map((r) => {
          const win = buffer.current.filter((f) => f.t >= r.t && f.t <= r.t + REACTION_WINDOW_MS);
          return {
            event: r.event,
            smileLeak: win.some((f) => f.duchenne),
            chipGlance: win.some((f) => f.gaze === "chips"),
            peakTension: win.reduce((m, f) => Math.max(m, f.tension), 0),
          };
        });
      return { handNumber: extras.handNumber, street: extras.street, decisionLatencyMs: extras.decisionLatencyMs, frames, cursor: extras.cursor, voice: extras.voice, cardRevealReactions };
    },
    [],
  );

  return { videoRef: attachVideo, status, frame, baseline, baselineRef, calibrating, calibrationReport, start, stop, calibrate, markReveal, noteLatency, snapshot };
}
