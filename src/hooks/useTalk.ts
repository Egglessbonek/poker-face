"use client";

/**
 * Sequential playback of AI table talk through ElevenLabs TTS (/api/elevenlabs/tts).
 * Every client at the table plays the same lines; disable with the table's `voice` setting or a local mute.
 *
 * - A line is fetched when its turn comes, so one that has gone stale by then (older than STALE_MS since it
 *   arrived, or from an earlier hand than the newest line waiting) is skipped rather than spoken a hand late.
 * - Browsers refuse audio.play() without a user gesture (a refreshed tab). Then `blocked` is true, the line
 *   stays at the head of the queue, and `unblock()` must be called from a click to resume.
 * - `unavailable` (the TTS route failing) needs two consecutive failures and clears on the next success.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { TalkEvent } from "@/hooks/useTable";

/** A line older than this when its turn comes is skipped: the moment has passed. */
export const STALE_MS = 12_000;
/** A line from an earlier hand is still spoken if it is this fresh: two seats talking at a hand's end must both be heard. */
export const EARLIER_HAND_GRACE_MS = 5_000;
/** Consecutive TTS failures before the header says "Voice unavailable". */
const FAILURES_BEFORE_UNAVAILABLE = 2;
/** One-sample silent WAV; playing it inside a click unlocks audio for the tab. */
const SILENT_WAV = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

export interface QueuedLine {
  event: TalkEvent;
  /** Client clock when the line arrived; the server's `at` is not trusted for staleness (clock skew). */
  receivedAt: number;
}

/** The lines still worth speaking, in order: drops stale ones and any from an earlier hand than the newest waiting. */
export function freshLines(queue: QueuedLine[], now: number): QueuedLine[] {
  const newestHand = queue.reduce((m, q) => Math.max(m, q.event.handNumber), -Infinity);
  return queue.filter((q) => now - q.receivedAt <= STALE_MS && (q.event.handNumber >= newestHand || now - q.receivedAt <= EARLIER_HAND_GRACE_MS));
}

type Outcome = "spoken" | "blocked" | "failed";

export function useTalk(talk: TalkEvent[], enabled: boolean) {
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const queue = useRef<QueuedLine[]>([]);
  const seen = useRef<number>(0);
  const busy = useRef(false);
  const onRef = useRef(false);
  const blockedRef = useRef(false);
  const failures = useRef(0);
  /** One audio element for every line: the element unlocked by a gesture stays unlocked (Safari re-blocks a fresh `new Audio()` after an await). */
  const player = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    onRef.current = enabled && !muted;
  }, [enabled, muted]);

  const speak = useCallback(async (t: TalkEvent): Promise<Outcome> => {
    let url: string | null = null;
    try {
      const res = await fetch("/api/elevenlabs/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: t.text, voiceId: t.voiceId }) });
      if (!res.ok) throw new Error(`tts ${res.status}`);
      const blob = await res.blob();
      failures.current = 0;
      setUnavailable(false);
      url = URL.createObjectURL(blob);
      const audio = (player.current ??= new Audio());
      audio.src = url;
      setSpeaking(t.playerId);
      return await new Promise<Outcome>((resolve) => {
        audio.onended = () => resolve("spoken");
        audio.onerror = () => resolve("failed");
        audio.play().catch((err: unknown) => {
          const name = (err as { name?: string } | null)?.name;
          resolve(name === "NotAllowedError" ? "blocked" : "failed");
        });
      });
    } catch {
      failures.current += 1;
      if (failures.current >= FAILURES_BEFORE_UNAVAILABLE) setUnavailable(true);
      return "failed";
    } finally {
      if (url) URL.revokeObjectURL(url);
      setSpeaking(null);
    }
  }, []);

  const pump = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      while (queue.current.length) {
        if (!onRef.current || blockedRef.current) return;
        queue.current = freshLines(queue.current, Date.now());
        const next = queue.current.shift();
        if (!next) return;
        const outcome = await speak(next.event);
        if (outcome === "blocked") {
          // Keep the line for the tap that unlocks audio; it is re-checked for staleness then.
          queue.current.unshift(next);
          blockedRef.current = true;
          setBlocked(true);
          return;
        }
      }
    } finally {
      busy.current = false;
    }
  }, [speak]);

  /** Call from a click or tap: unlocks audio for the tab and resumes the queue. */
  const unblock = useCallback(() => {
    blockedRef.current = false;
    setBlocked(false);
    // A play() inside the gesture is what grants the tab audio; the outcome of the silent clip itself is irrelevant.
    const audio = (player.current ??= new Audio());
    audio.src = SILENT_WAV;
    audio.play().catch(() => {});
    void pump();
  }, [pump]);

  // Any click on the page (Fold, Call, a slider) is a user gesture too: use the first one to unlock instead of
  // waiting for someone to notice the header button.
  useEffect(() => {
    if (!blocked) return;
    const onPointer = () => unblock();
    document.addEventListener("pointerdown", onPointer, { once: true });
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [blocked, unblock]);

  useEffect(() => {
    const fresh = talk.filter((t) => t.id > seen.current);
    if (!fresh.length) return;
    seen.current = fresh[fresh.length - 1].id;
    if (!onRef.current) return;
    const now = Date.now();
    queue.current.push(...fresh.map((event) => ({ event, receivedAt: now })));
    void pump();
  }, [talk, pump]);

  return { speaking, muted, setMuted, unavailable, blocked, unblock };
}
