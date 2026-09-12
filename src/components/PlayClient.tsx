"use client";

/**
 * The table. Owns: session creation, calibration, webcam + tell pipeline, hand loop, villain calls,
 * ElevenLabs agent, rail publishing.
 *
 * TODO(phase 2): mount WebcamFeed + Calibration, stream TellFrames into TellHUD
 * TODO(phase 3): cursor tracker on ActionBar, TellSnapshot per hero action -> fuseTells -> act(..., tells)
 * TODO(phase 5): useConversation, sendContextualUpdate / sendUserMessage
 * TODO(phase 6): publish tells RailEvents to /api/rail/[code] (hand + villain events are published server-side)
 */

import { useEffect, useState } from "react";
import Table from "@/components/Table";
import TellHUD from "@/components/TellHUD";
import { useMatch } from "@/hooks/useMatch";
import { PERSONAS } from "@/lib/villain/personas";

export default function PlayClient() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [railCode, setRailCode] = useState<string | null>(null);
  const persona = PERSONAS[0];
  const match = useMatch(sessionId);

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
      {match.error && <p className="rounded-lg bg-danger/20 px-3 py-2 text-sm text-danger">{match.error}</p>}
      <div className="grid flex-1 gap-4 lg:grid-cols-[1fr_320px]">
        <Table
          state={match.state}
          decisions={match.lastDecisions}
          pending={match.pending}
          villainName={persona.name}
          onAct={(type, amount) => match.act(type, amount)}
          onNext={match.next}
          onStart={match.start}
          revealHref={sessionId ? `/reveal/${sessionId}` : undefined}
        />
        <TellHUD />
      </div>
    </main>
  );
}
