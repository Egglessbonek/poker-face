"use client";

/**
 * The table. Owns: session creation, calibration, webcam + tell pipeline, hand loop, villain calls,
 * ElevenLabs agent, rail publishing.
 *
 * TODO(phase 1): hand loop with engine.ts
 * TODO(phase 2): mount WebcamFeed + Calibration, stream TellFrames into TellHUD
 * TODO(phase 3): cursor tracker on ActionBar, TellSnapshot per hero action -> fuseTells
 * TODO(phase 4): POST /api/villain/act with tells
 * TODO(phase 5): useConversation, sendContextualUpdate / sendUserMessage
 * TODO(phase 6): publish RailEvents to /api/rail/[code]
 */

import { useEffect, useState } from "react";
import Table from "@/components/Table";
import TellHUD from "@/components/TellHUD";
import { PERSONAS } from "@/lib/villain/personas";

export default function PlayClient() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [railCode, setRailCode] = useState<string | null>(null);
  const persona = PERSONAS[0];

  useEffect(() => {
    let cancelled = false;
    fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personaId: persona.id }) })
      .then((r) => r.json())
      .then((d: { sessionId: string; railCode: string }) => {
        if (cancelled) return;
        setSessionId(d.sessionId);
        setRailCode(d.railCode);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [persona.id]);

  return (
    <main className="flex flex-1 flex-col gap-4 px-4 py-6 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gold">Heads-up vs {persona.name}</p>
          <p className="text-sm text-muted">{persona.tagline}</p>
        </div>
        <div className="rounded-lg border border-felt-edge px-4 py-2 font-mono text-sm">
          Rail code: <span className="text-gold">{railCode ?? "…"}</span>
        </div>
      </header>
      <div className="grid flex-1 gap-4 lg:grid-cols-[1fr_320px]">
        <Table sessionId={sessionId} />
        <TellHUD />
      </div>
    </main>
  );
}
