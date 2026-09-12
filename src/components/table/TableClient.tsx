"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Eye, Radio } from "lucide-react";
import ActionBar from "@/components/ActionBar";
import BluffMeter from "@/components/BluffMeter";
import Calibration from "@/components/Calibration";
import WebcamFeed from "@/components/WebcamFeed";
import FinishedTable from "@/components/table/FinishedTable";
import JoinForm from "@/components/table/JoinForm";
import OvalTable from "@/components/table/OvalTable";
import TableLobby from "@/components/table/TableLobby";
import { useTable } from "@/hooks/useTable";
import { useTalk } from "@/hooks/useTalk";
import { useTells } from "@/hooks/useTells";
import { clearIdentity, loadIdentity, saveIdentity, type Identity } from "@/lib/client/identity";
import { dominantEmotion } from "@/lib/tells/emotion";
import { fuseTells } from "@/lib/tells/fuse";
import { getFaceLandmarker } from "@/lib/tells/landmarker";
import TellHUD from "@/components/TellHUD";
import VoiceControls from "@/components/table/VoiceControls";
import type { ActionType, Player, PlayerTells, TellVector } from "@/lib/types";

export default function TableClient({ code }: { code: string }) {
  const [identity, setIdentity] = useState<Identity | null | undefined>(undefined);
  const [gone, setGone] = useState<string | null>(null);

  useEffect(() => {
    const saved = loadIdentity(code);
    const url = `/api/table/${code}${saved ? `?token=${encodeURIComponent(saved.token)}` : ""}`;
    fetch(url)
      .then((response) => {
        if (response.status === 404) {
          setGone("No table with that code. It may have closed, or the server restarted.");
          if (saved) clearIdentity(code);
          setIdentity(null);
        } else if (response.status === 401) {
          clearIdentity(code);
          setIdentity(null);
        } else {
          setIdentity(saved);
        }
      })
      .catch(() => setIdentity(saved));
  }, [code]);

  if (gone) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-gold">Table {code}</p>
        <h1 className="text-3xl font-semibold">This table has left the room.</h1>
        <p className="max-w-md text-sm text-muted">{gone}</p>
        <Link href="/" className="rounded-full bg-gold px-6 py-2.5 font-medium text-background">Back to Poker Face</Link>
      </main>
    );
  }
  if (identity === undefined) return <main className="flex flex-1 items-center justify-center"><p className="animate-pulse text-sm text-muted">Finding your seat…</p></main>;
  if (identity === null) return <JoinForm code={code} onJoined={setIdentity} />;
  return <Seated code={code} identity={identity} />;
}

function Seated({ code, identity }: { code: string; identity: Identity }) {
  const router = useRouter();
  const table = useTable(code, identity.token, identity.playerId);
  const tells = useTells();
  const voice = useTalk(table.talk, table.state?.config.voice ?? true);
  /** The fused read from this player's latest decision, tagged with its hand so it is never re-sent into the next one. */
  const [lastVector, setLastVector] = useState<{ vector: TellVector; handNumber: number } | null>(null);
  /** Once the camera has run, a later "idle" means it was lost and should be restarted; a skipped camera never was. */
  const cameraEverOn = useRef(false);
  const [cameraDone, setCameraDone] = useState(false);
  /** The callout banner that has finished animating; it unmounts so no blank strip is left above the felt. */
  const [calloutDone, setCalloutDone] = useState<string | null>(null);
  /** The prompt (hand + action count) an action was already sent for; a double-click must not send a second one. */
  const [sentFor, setSentFor] = useState<string | null>(null);
  const vectorHistory = useRef<TellVector[]>([]);
  /** Rolling UI reads after the first decision; kept separate so live updates never change action-time AI evidence. */
  const liveVectorHistory = useRef<TellVector[]>([]);
  const promptedAt = useRef(0);
  const wasMyTurn = useRef(false);
  const previousReveal = useRef("");
  const lastTellsSent = useRef(0);

  const { state, hand, me, myTurn, sendTells, act } = table;
  const baseline = tells.baseline;
  const frame = tells.frame;
  const markReveal = tells.markReveal;
  const snapshotTells = tells.snapshot;

  useEffect(() => {
    if (baseline) sendTells({ baseline });
  }, [baseline, sendTells]);

  // The face model is ~8MB from a CDN; fetch it while the player reads the lobby, not when they click "Turn on camera".
  useEffect(() => {
    void getFaceLandmarker().catch(() => {});
  }, []);

  useEffect(() => {
    if (tells.status === "running") cameraEverOn.current = true;
  }, [tells.status]);

  useEffect(() => {
    if (!hand || !me) return;
    const mine = hand.seats[me.seat];
    const key = `${hand.handNumber}:${hand.board.length}:${mine?.holeCards.join("") ?? ""}`;
    if (key === previousReveal.current) return;
    previousReveal.current = key;
    if (!mine) return;
    if (hand.board.length === 0 && mine.holeCards.length) markReveal("hole");
    else if (hand.board.length === 3) markReveal("flop");
    else if (hand.board.length === 4) markReveal("turn");
    else if (hand.board.length === 5) markReveal("river");
  }, [hand, markReveal, me]);

  useEffect(() => {
    if (myTurn && !wasMyTurn.current) {
      promptedAt.current = Date.now();
    }
    wasMyTurn.current = myTurn;
  }, [myTurn]);

  useEffect(() => {
    if (state?.phase !== "playing" || !frame) return;
    const now = Date.now();
    if (now - lastTellsSent.current < 2000) return;
    lastTellsSent.current = now;
    if (!baseline || !hand || !lastVector || lastVector.handNumber !== hand.handNumber) {
      liveVectorHistory.current = [];
      sendTells({ frame, vector: null });
      return;
    }

    const liveSnapshot = snapshotTells(now - 4000, {
      handNumber: hand.handNumber,
      street: hand.street,
      // Live display updates should not invent a fast/slow action tell between decisions.
      decisionLatencyMs: baseline.decisionLatencyMs,
    });
    const history = liveVectorHistory.current.length >= 2 ? liveVectorHistory.current : [lastVector.vector, lastVector.vector];
    const liveVector = fuseTells(liveSnapshot, baseline, history);
    liveVectorHistory.current = [...liveVectorHistory.current.slice(-19), liveVector];
    sendTells({ frame, vector: liveVector });
  }, [baseline, frame, hand, lastVector, sendTells, snapshotTells, state?.phase]);

  const onAct = useCallback((type: ActionType, amount?: number) => {
    if (!hand) return;
    const promptKey = `${hand.handNumber}:${hand.actions.length}`;
    setSentFor(promptKey);
    const latency = Date.now() - promptedAt.current;
    let vector: TellVector | null = null;
    if (tells.status === "running" && tells.baselineRef.current) {
      const snapshot = tells.snapshot(promptedAt.current, { handNumber: hand.handNumber, street: hand.street, decisionLatencyMs: latency });
      vector = fuseTells(snapshot, tells.baselineRef.current, vectorHistory.current);
      vectorHistory.current = [...vectorHistory.current.slice(-20), vector];
      tells.noteDecision(snapshot, latency);
      setLastVector({ vector, handNumber: hand.handNumber });
      liveVectorHistory.current = [vector, vector];
    }
    // A rejected action (stale bet bounds) must hand the bar back, or the player is stuck until the timer folds them.
    void act(type, amount, latency, vector).then((ok) => {
      if (!ok) setSentFor(null);
    });
  }, [act, hand, tells]);

  const finishCamera = useCallback(() => setCameraDone(true), []);
  // Safety net: if the camera somehow stopped between the lobby and the first hand, bring it back so tells keep flowing.
  const startCamera = tells.start;
  const hasBaseline = !!tells.baseline;
  useEffect(() => {
    if (state?.phase === "playing" && tells.status === "idle" && (hasBaseline || cameraEverOn.current)) void startCamera();
  }, [state?.phase, hasBaseline, tells.status, startCamera]);
  const leave = useCallback(() => {
    void table.leave().then(() => {
      clearIdentity(code);
      router.push("/");
    });
  }, [code, router, table]);
  // Rematch: the server seats the host at the new table; carry that identity over and go there.
  const requestRematch = table.rematch;
  const rematch = useCallback(async () => {
    const next = await requestRematch();
    if (!next) return;
    saveIdentity(next.code, { playerId: next.playerId, token: next.token, name: identity.name });
    router.push(`/table/${next.code}`);
  }, [identity.name, requestRematch, router]);

  const camera = <CameraSetup tells={tells} done={cameraDone} onDone={finishCamera} />;

  if (!state) {
    return (
      <main className="flex flex-1 items-center justify-center text-muted">
        {table.status === "error" ? <div className="text-center"><p>Lost the table connection.</p><button onClick={() => location.reload()} className="mt-3 rounded-full bg-gold px-5 py-2 text-background">Reconnect</button></div> : <p className="animate-pulse">Connecting to the table…</p>}
      </main>
    );
  }

  if (state.phase === "lobby") return <TableLobby state={state} playerId={identity.playerId} camera={camera} onAddAI={table.addAI} onRemove={table.removePlayer} onStart={table.start} onLeave={leave} />;
  if (state.phase === "finished") return <FinishedTable state={state} playerId={identity.playerId} rematchCode={table.rematchCode} onRematch={rematch} error={table.error} />;

  const opponents = state.players.filter((player) => player.id !== identity.playerId);
  const detailedTells = state.config.tellVisibility === "everyone" ? opponents.filter((player) => player.kind === "human" && table.tells[player.id]) : [];
  const aiReads = opponents.filter((player) => player.kind === "ai" && table.reads[player.id]?.handNumber === hand?.handNumber);
  // The moment: the newest AI decision this hand that used a tell. Keyed by its timestamp so the banner re-animates per read.
  const callout = aiReads
    .map((player) => ({ player, read: table.reads[player.id] }))
    .filter(({ read }) => read.decision.tellsUsed.length > 0)
    .sort((a, b) => b.read.at - a.read.at)[0];
  const calloutKey = callout ? `${callout.player.id}-${callout.read.at}` : null;

  return (
    <main className="flex flex-1 flex-col gap-4 px-3 py-4 sm:px-6">
      <TableHeader code={code} playerName={me?.name} status={table.status} voiceOn={state.config.voice} voice={voice} isHost={state.hostId === identity.playerId} onEnd={table.end} />
      {table.error && <p className="rounded-xl bg-danger/15 px-4 py-2 text-sm text-danger">{table.error}</p>}
      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_290px]">
        <section className="flex min-w-0 flex-col gap-3">
          {callout && calloutKey && calloutKey !== calloutDone && (
            <div key={calloutKey} onAnimationEnd={() => setCalloutDone(calloutKey)} className="animate-callout flex items-start gap-2 rounded-2xl border border-gold/50 bg-gold/10 px-4 py-2.5 text-sm shadow-[0_0_30px_rgba(212,175,55,0.15)]">
              <Eye size={16} className="mt-0.5 shrink-0 text-gold" />
              <p><span className="font-semibold text-gold">{callout.player.name}</span> <span className="text-muted">read the table on the {callout.read.street}:</span> {callout.read.decision.tellsUsed.join(" · ")}</p>
            </div>
          )}
          <OvalTable state={state} viewerSeat={me?.seat ?? null} lastActions={table.lastActions} talk={table.talk} speaking={voice.speaking} tells={table.tells} />
          {hand && !hand.over && me && !me.sittingOut && <ActionBar legal={table.legal} bounds={table.bounds} pot={hand.pot} disabled={!myTurn || sentFor === `${hand.handNumber}:${hand.actions.length}`} onAct={onAct} />}
          {hand?.over && <p className="text-center text-xs text-muted">Next hand in a moment…</p>}
        </section>

        <aside className="flex flex-col gap-3">
          <section className="rounded-2xl border border-felt-edge p-3">
            <div className="mb-2 flex items-center justify-between text-xs"><span className="flex items-center gap-1.5 font-medium"><Radio size={13} className={tells.status === "running" ? "text-ok" : "text-muted"} /> Your camera</span><span className="text-muted">{tells.status === "running" ? "tells sent every 2s" : tells.status}</span></div>
            {cameraDone || baseline ? <><WebcamFeed videoRef={tells.videoRef} className="aspect-[4/3] w-full" /><p className="mt-2 text-xs text-muted">{baseline ? "Calibrated. Your bluff read stays hidden until the reveal." : tells.status === "running" ? "Camera on without a baseline; reads are coarse." : "Playing without a camera."}</p>{tells.status === "running" && <div className="mt-2"><TellHUD frame={frame} baseline={baseline} vector={null} cameraStatus="live" /></div>}</> : camera}
          </section>

          {detailedTells.map((player) => <OpponentTells key={player.id} player={player} tells={table.tells[player.id]} />)}

          {aiReads.length > 0 && (
            <section className="rounded-2xl border border-felt-edge p-3 text-xs">
              <p className="mb-2 flex items-center gap-2 font-semibold text-gold"><Eye size={13} /> Reads on you this hand</p>
              <ul className="flex flex-col gap-2">{aiReads.map((player) => { const read = table.reads[player.id]; return <li key={player.id}><span className="font-medium">{player.name}</span> <span className="capitalize text-muted">· {read.street}</span><p className="mt-0.5 text-muted">{read.decision.tellsUsed.length ? read.decision.tellsUsed.join(" · ") : "No tell used. Played the odds."}</p></li>; })}</ul>
            </section>
          )}

          {table.history.length > 0 && (
            <section className="rounded-2xl border border-felt-edge p-3 text-xs">
              <p className="mb-2 font-semibold">Recent hands</p>
              <ul className="flex flex-col gap-1.5 text-muted">{table.history.slice(-4).reverse().map((record) => <li key={record.handNumber} className="flex justify-between gap-2"><span>Hand {record.handNumber}</span><span className="truncate font-mono">{record.board.join(" ") || "preflop"}</span></li>)}</ul>
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}

function CameraSetup({ tells, done, onDone }: { tells: ReturnType<typeof useTells>; done: boolean; onDone: () => void }) {
  if (done || tells.baseline) {
    return <div className="rounded-2xl border border-felt-edge p-3"><p className="mb-2 text-xs font-semibold text-gold">Your camera</p><WebcamFeed videoRef={tells.videoRef} className="aspect-[4/3] w-full" /><p className="mt-2 text-xs text-muted">{tells.baseline ? `Baseline captured: ${tells.calibrationReport ?? "you are ready"}.` : tells.status === "running" ? (tells.calibrationReport ?? "Camera on without a baseline.") : "Playing without a camera."}</p>{!tells.baseline && tells.status === "running" && <button onClick={() => tells.calibrate().then((b) => b && onDone())} className="mt-2 w-full rounded-lg border border-felt-edge py-1.5 text-xs">Capture a 10s baseline</button>}</div>;
  }
  return <Calibration videoRef={tells.videoRef} status={tells.status} progress={tells.calibrating?.progress ?? null} facePresent={!!tells.frame?.facePresent} onStartCamera={tells.start} onCalibrate={() => tells.calibrate().then((b) => b && onDone())} onSkip={onDone} message={tells.baseline ? null : tells.calibrationReport} />;
}

function OpponentTells({ player, tells }: { player: Player; tells: PlayerTells }) {
  const vector = tells.vector;
  const frame = tells.frame;
  return (
    <section className="rounded-2xl border border-felt-edge p-3 text-xs">
      <div className="mb-1 flex items-center justify-between"><span className="font-semibold">{player.name}</span><span className="font-mono text-muted">{frame ? frame.facePresent ? dominantEmotion(frame.emotion) : "no face" : "—"}</span></div>
      {vector ? <><BluffMeter value={vector.bluffLikelihood} /><p className="text-muted">Composure {100 - vector.arousal} · {vector.trend === "rising" ? "falling" : vector.trend === "falling" ? "rising" : vector.trend}</p>{vector.evidence.slice(0, 2).map((evidence, index) => <p key={index} className={evidence.direction === "bluff" ? "text-danger" : evidence.direction === "strength" ? "text-ok" : "text-muted"}>• {evidence.text}</p>)}</> : <p className="text-muted">{frame ? `Blink ${frame.blinkRate.toFixed(0)}/min · tension ${Math.round(frame.tension * 100)}%` : "No read yet"}</p>}
    </section>
  );
}

function TableHeader({ code, playerName, status, voiceOn, voice, isHost, onEnd }: { code: string; playerName?: string; status: string; voiceOn: boolean; voice: ReturnType<typeof useTalk>; isHost: boolean; onEnd: () => void }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-felt-edge bg-background/90 px-4 py-3">
      <div className="flex items-center gap-3"><div><p className="text-[10px] uppercase tracking-[0.28em] text-muted">Poker Face</p><p className="text-sm">Table <span className="font-mono text-gold">{code}</span></p></div><span className="text-xs text-muted">{playerName}</span><span className={`h-2 w-2 rounded-full ${status === "live" ? "bg-ok" : "bg-danger"}`} title={status} /></div>
      <div className="flex items-center gap-2">
        {isHost && <EndGameButton onEnd={onEnd} />}
        <Link href={`/rail/${code}`} target="_blank" className="rounded-full border border-felt-edge px-4 py-2 text-xs text-muted hover:border-gold hover:text-foreground">Open rail</Link>
        <button type="button" aria-label="Copy table code" onClick={() => navigator.clipboard?.writeText(code)} className="rounded-full border border-felt-edge p-2.5 text-muted hover:border-gold hover:text-foreground"><Copy size={15} /></button>
        {voiceOn && <VoiceControls voice={voice} />}
      </div>
    </header>
  );
}

/** Two clicks to end the match, so a stray click cannot kill a live game. */
function EndGameButton({ onEnd }: { onEnd: () => void }) {
  const [arming, setArming] = useState(false);
  useEffect(() => {
    if (!arming) return;
    const id = setTimeout(() => setArming(false), 4000);
    return () => clearTimeout(id);
  }, [arming]);
  return arming ? (
    <button type="button" onClick={onEnd} className="rounded-full border border-danger bg-danger/20 px-4 py-2 text-xs font-semibold text-danger">Confirm: end the match</button>
  ) : (
    <button type="button" onClick={() => setArming(true)} className="rounded-full border border-felt-edge px-4 py-2 text-xs text-muted hover:border-danger hover:text-danger">End game</button>
  );
}
