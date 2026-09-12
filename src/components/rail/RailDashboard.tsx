"use client";

/**
 * Spectator view. Subscribes to /api/rail/[code] over SSE.
 * Spectators see hero's hole cards, live tells, bluff meter, and the villain's stated read.
 * TODO(phase 6): full layout, emotion wheel, arousal sparkline, evidence feed, hand history.
 */
import { useEffect, useState } from "react";
import BluffMeter from "@/components/BluffMeter";
import type { RailEvent } from "@/lib/types";

export default function RailDashboard({ code }: { code: string }) {
  const [events, setEvents] = useState<RailEvent[]>([]);
  const [status, setStatus] = useState<"connecting" | "live" | "ended" | "error">("connecting");

  useEffect(() => {
    const es = new EventSource(`/api/rail/${code}`);
    es.onopen = () => setStatus("live");
    es.onmessage = (m) => {
      const ev = JSON.parse(m.data) as RailEvent;
      if (ev.type === "ended") setStatus("ended");
      setEvents((prev) => [...prev.slice(-200), ev]);
    };
    es.onerror = () => setStatus((s) => (s === "ended" ? s : "error"));
    return () => es.close();
  }, [code]);

  const lastTells = [...events].reverse().find((e) => e.type === "tells");
  const bluff = lastTells?.type === "tells" ? lastTells.vector?.bluffLikelihood ?? 0.5 : 0.5;

  return (
    <main className="flex flex-1 flex-col gap-4 px-4 py-6 sm:px-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Rail · <span className="font-mono text-gold">{code}</span></h1>
        <span className="text-xs uppercase tracking-widest text-muted">{status}</span>
      </header>
      <BluffMeter value={bluff} />
      <pre className="max-h-[60vh] overflow-auto rounded-xl border border-felt-edge p-3 font-mono text-[11px]">
        {events.slice(-30).map((e) => JSON.stringify(e)).reverse().join("\n") || "waiting for the table…"}
      </pre>
    </main>
  );
}
