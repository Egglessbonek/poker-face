"use client";

/**
 * Sequential playback of AI table talk through ElevenLabs TTS (/api/elevenlabs/tts).
 * Every client at the table plays the same lines; disable with the table's `voice` setting or a local mute.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { TalkEvent } from "@/hooks/useTable";

export function useTalk(talk: TalkEvent[], enabled: boolean) {
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const queue = useRef<TalkEvent[]>([]);
  const seen = useRef<number>(0);
  const busy = useRef(false);
  const onRef = useRef(false);
  useEffect(() => {
    onRef.current = enabled && !muted;
  }, [enabled, muted]);

  const speak = useCallback(async (t: TalkEvent) => {
    try {
      const res = await fetch("/api/elevenlabs/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: t.text, voiceId: t.voiceId }) });
      if (!res.ok) {
        setUnavailable(true);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      setSpeaking(t.playerId);
      await new Promise<void>((resolve) => {
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
        audio.play().catch(() => resolve());
      });
      URL.revokeObjectURL(url);
    } catch {
      setUnavailable(true);
    } finally {
      setSpeaking(null);
    }
  }, []);

  const pump = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      while (queue.current.length) {
        const next = queue.current.shift()!;
        if (!onRef.current) continue;
        await speak(next);
      }
    } finally {
      busy.current = false;
    }
  }, [speak]);

  useEffect(() => {
    const fresh = talk.filter((t) => t.id > seen.current);
    if (!fresh.length) return;
    seen.current = fresh[fresh.length - 1].id;
    if (!onRef.current) return;
    queue.current.push(...fresh);
    void pump();
  }, [talk, pump]);

  return { speaking, muted, setMuted, unavailable };
}
