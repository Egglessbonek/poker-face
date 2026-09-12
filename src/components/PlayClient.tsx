"use client";

/**
 * The table. Owns: session, calibration, tell pipeline, hand loop, rail publishing of tells.
 * Hand and villain events are published to the rail server-side.
 *
 * TODO(phase 5): useConversation, sendContextualUpdate / sendUserMessage
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Calibration from "@/components/Calibration";
import Table from "@/components/Table";
import TellHUD from "@/components/TellHUD";
import WebcamFeed from "@/components/WebcamFeed";
import { useMatch } from "@/hooks/useMatch";
import { useTells } from "@/hooks/useTells";
import { createCursorTracker } from "@/lib/tells/cursor";
import { fuseTells } from "@/lib/tells/fuse";
import { PERSONAS } from "@/lib/villain/personas";
import type { ActionType, TellVector } from "@/lib/types";

type Phase = "setup" | "play";

export default function PlayClient() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [railCode, setRailCode] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("setup");
  const [lastVector, setLastVector] = useState<TellVector | null>(null);
  const persona = PERSONAS[0];
  const match = useMatch(sessionId);
  const tells = useTells();
  const cursor = useMemo(() => createCursorTracker(), []);
  const vectorHistory = useRef<TellVector[]>([]);
  const promptedAtEpoch = useRef<number>(0);

  // Session
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

  // Persist baseline once calibrated.
  useEffect(() => {
    if (sessionId && tells.baseline) {
      fetch("/api/session", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, baseline: tells.baseline }) }).catch(console.error);
    }
    // Only on first calibration; latency updates don't need a round-trip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, tells.baseline?.calibratedAt]);

  // Track when the hero is prompted, and card reveals, from match state changes.
  const hand = match.state?.hand ?? null;
  const prevKey = useRef<string>("");
  useEffect(() => {
    if (!hand) return;
    const key = `${hand.handNumber}:${hand.board.length}:${hand.players.hero.holeCards.join("")}`;
    if (key !== prevKey.current) {
      if (hand.board.length === 0 && hand.players.hero.holeCards.length) tells.markReveal("hole");
      else if (hand.board.length === 3) tells.markReveal("flop");
      else if (hand.board.length === 4) tells.markReveal("turn");
      else if (hand.board.length === 5) tells.markReveal("river");
      prevKey.current = key;
    }
    if (hand.toAct === "hero" && !hand.over) {
      promptedAtEpoch.current = Date.now();
      cursor.start();
    }
  }, [hand, tells, cursor]);

  // Stream live tells to the rail at ~2Hz.
  useEffect(() => {
    if (!railCode || !tells.frame || phase !== "play") return;
    const f = tells.frame;
    if (Math.round(f.t / 250) % 2 !== 0) return;
    fetch(`/api/rail/${railCode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "tells", frame: f, vector: lastVector ?? undefined }) }).catch(() => {});
  }, [railCode, tells.frame, lastVector, phase]);

  const onAct = useCallback(
    (type: ActionType, amount?: number) => {
      const h = match.state?.hand;
      let vector: TellVector | null = null;
      if (h && tells.status === "running" && tells.baselineRef.current) {
        const latency = Date.now() - promptedAtEpoch.current;
        const snap = tells.snapshot(promptedAtEpoch.current, { handNumber: h.handNumber, street: h.street, decisionLatencyMs: latency, cursor: cursor.finish() });
        vector = fuseTells(snap, tells.baselineRef.current, vectorHistory.current);
        vectorHistory.current = [...vectorHistory.current.slice(-20), vector];
        tells.noteLatency(latency);
        setLastVector(vector);
      }
      match.act(type, amount, vector);
    },
    [match, tells, cursor],
  );

  const startPlay = useCallback(() => {
    setPhase("play");
    match.start();
  }, [match]);

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

      {phase === "setup" ? (
        <Calibration
          videoRef={tells.videoRef}
          status={tells.status}
          progress={tells.calibrating?.progress ?? null}
          facePresent={!!tells.frame?.facePresent}
          onStartCamera={tells.start}
          onCalibrate={() => tells.calibrate().then(startPlay)}
          onSkip={startPlay}
        />
      ) : (
        <div className="grid flex-1 gap-4 lg:grid-cols-[1fr_320px]">
          <Table
            state={match.state}
            decisions={match.lastDecisions}
            pending={match.pending}
            villainName={persona.name}
            onAct={onAct}
            onNext={match.next}
            onStart={match.start}
            revealHref={sessionId ? `/reveal/${sessionId}` : undefined}
            cursor={cursor}
          />
          <div className="flex flex-col gap-3">
            <WebcamFeed videoRef={tells.videoRef} className="aspect-[4/3] w-full" />
            <TellHUD frame={tells.frame} baseline={tells.baseline} vector={lastVector} cameraStatus={tells.status} />
          </div>
        </div>
      )}
    </main>
  );
}
