"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Eye, X } from "lucide-react";
import { usePresage } from "@/hooks/usePresage";
import ActionBar from "@/components/ActionBar";
import BluffMeter from "@/components/BluffMeter";
import Calibration from "@/components/Calibration";
import WebcamFeed from "@/components/WebcamFeed";
import FinishedTable from "@/components/table/FinishedTable";
import JoinForm from "@/components/table/JoinForm";
import OvalTable from "@/components/table/OvalTable";
import TableLobby from "@/components/table/TableLobby";
import { useTable } from "@/hooks/useTable";
import { useLobbyCameraStatus } from "@/hooks/useLobbyCameraStatus";
import { useTalk } from "@/hooks/useTalk";
import { useTells } from "@/hooks/useTells";
import { clearIdentity, loadIdentity, saveIdentity, type Identity } from "@/lib/client/identity";
import { dominantEmotion } from "@/lib/tells/emotion";
import { AFTER_ACTION_MS, fuseAfterAction, fuseTells } from "@/lib/tells/fuse";
import { getFaceLandmarker } from "@/lib/tells/landmarker";
import { tellAudiences } from "@/lib/tells/visibility";
import PlayerCameraPanel from "@/components/table/PlayerCameraPanel";
import VoiceControls from "@/components/table/VoiceControls";
import BestHand from "@/components/table/BestHand";
import layout from "./GameLayout.module.css";
import type { ActionType, LobbyCameraStatus, Player, PlayerTells, TellVector } from "@/lib/types";

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
        <p className="text-xs text-gold">Table {code}</p>
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
  const [infoOpen, setInfoOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const router = useRouter();
  const table = useTable(code, identity.token, identity.playerId);
  const tells = useTells();
  const presage = usePresage(code, identity.token, tells.videoElementRef, tells.status === "running" && table.state?.phase !== "finished", tells.captureContextRef);
  const voice = useTalk(table.talk, table.state?.config.voice ?? true);
  /** The fused read from this player's latest decision, tagged with its hand so it is never re-sent into the next one. */
  const [lastVector, setLastVector] = useState<{ vector: TellVector; handNumber: number } | null>(null);
  /** Once the camera has run, a later "idle" means it was lost and should be restarted; a skipped camera never was. */
  const cameraEverOn = useRef(false);
  const cameraSuppressed = useRef(false);
  /** The hand on screen, readable from a timer callback. */
  const handNumberRef = useRef(0);
  const afterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cameraDone, setCameraDone] = useState(false);
  const [cameraDialogOpen, setCameraDialogOpen] = useState(true);
  /** The callout banner that has finished animating; it unmounts so no blank strip is left above the felt. */
  const [calloutDone, setCalloutDone] = useState<string | null>(null);
  /** The prompt (hand + action count) an action was already sent for; a double-click must not send a second one. */
  const [sentFor, setSentFor] = useState<string | null>(null);
  const vectorHistory = useRef<TellVector[]>([]);
  /** Rolling live reads after the first decision; action-time history remains a separate trend baseline. */
  const liveVectorHistory = useRef<TellVector[]>([]);
  const promptedAt = useRef(0);
  const interruptedAt = useRef(0);
  useEffect(() => {
    const interrupt = () => { if (document.hidden || !navigator.onLine) interruptedAt.current = Date.now(); };
    document.addEventListener("visibilitychange", interrupt); window.addEventListener("offline", interrupt);
    return () => { document.removeEventListener("visibilitychange", interrupt); window.removeEventListener("offline", interrupt); };
  }, []);
  const wasMyTurn = useRef(false);
  const previousReveal = useRef("");
  const lastTellsSent = useRef(0);

  const { state, hand, me, myTurn, sendTells, act } = table;
  const baseline = tells.baseline;
  const frame = tells.frame;
  const markReveal = tells.markReveal;
  const snapshotTells = tells.snapshot;
  const ownCameraStatus: LobbyCameraStatus = tells.baseline && tells.status === "running" ? "ready" : cameraDialogOpen || tells.status === "starting" || tells.status === "running" ? "setting_up" : cameraDone ? "skipped" : "not_started";
  const lobbyStatus = useLobbyCameraStatus(code, identity.token, identity.playerId, ownCameraStatus, state?.phase === "lobby");

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
    handNumberRef.current = hand?.handNumber ?? 0;
  }, [hand?.handNumber]);
  useEffect(() => () => { if (afterTimer.current) clearTimeout(afterTimer.current); }, []);

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
      sendTells({ frame: { ...frame, mouthMoving: undefined }, live: null });
      return;
    }

    const liveSnapshot = snapshotTells(now - 4000, {
      handNumber: hand.handNumber,
      street: hand.street,
      // This rolling feed keeps the rail current and gives AIs the latest webcam read on their next turn.
      // Keep decision latency neutral here because no new player decision occurred.
      decisionLatencyMs: 0,
    });
    const history = liveVectorHistory.current.length >= 2 ? liveVectorHistory.current : [lastVector.vector, lastVector.vector];
    const liveVector = fuseTells(liveSnapshot, baseline, history);
    liveVectorHistory.current = [...liveVectorHistory.current.slice(-19), liveVector];
    // Spectators only: the rolling read goes under `live`. The AIs read `vector` (the decision) and `after` (post-bet).
    sendTells({ frame: { ...frame, mouthMoving: undefined }, live: liveVector });
  }, [baseline, frame, hand, lastVector, sendTells, snapshotTells, state?.phase]);

  const onAct = useCallback((type: ActionType, amount?: number) => {
    if (!hand) return;
    const promptKey = `${hand.handNumber}:${hand.actions.length}`;
    setSentFor(promptKey);
    const latency = Date.now() - promptedAt.current;
    const timingValid = promptedAt.current > interruptedAt.current && !document.hidden && navigator.onLine;
    const snapshot = tells.snapshot(promptedAt.current, { handNumber: hand.handNumber, street: hand.street, decisionLatencyMs: timingValid ? latency : 0 });
    if (tells.status !== "running") snapshot.frames = [];
    const vector = fuseTells(snapshot, tells.baselineRef.current, vectorHistory.current);
    if (tells.status === "running" && tells.baselineRef.current) {
      if (type === "bet" || type === "raise" || type === "allin") {
        const actedAt = Date.now();
        const { handNumber, street } = hand;
        if (afterTimer.current) clearTimeout(afterTimer.current);
        afterTimer.current = setTimeout(() => {
          const b = tells.baselineRef.current;
          if (!b || handNumberRef.current !== handNumber) return;
          const after = fuseAfterAction(tells.snapshot(actedAt, { handNumber, street, decisionLatencyMs: b.decisionLatencyMs }), b);
          void sendTells({ after });
        }, AFTER_ACTION_MS);
      }
    }
    // A rejected action (stale bet bounds) must hand the bar back, or the player is stuck until the timer folds them.
    void act(type, amount, timingValid ? latency : undefined, vector).then((ok) => {
      if (!ok) setSentFor(null);
      else {
        vectorHistory.current = [...vectorHistory.current.slice(-19), vector];
        setLastVector({ vector, handNumber: hand.handNumber });
        if (timingValid) tells.noteDecision(snapshot, latency);
      }
    });
  }, [act, hand, sendTells, tells]);

  const finishCamera = useCallback(() => {
    setCameraDone(true);
    setCameraDialogOpen(false);
  }, []);
  const skipCamera = useCallback(() => {
    tells.stop();
    // A deliberate skip is not a lost camera: the first-hand safety net must not bring it back.
    cameraEverOn.current = false;
    cameraSuppressed.current = true;
    setCameraDone(true);
    setCameraDialogOpen(false);
  }, [tells]);
  const openCamera = useCallback(() => {
    cameraSuppressed.current = false;
    if (!tells.baseline) setCameraDone(false);
    setCameraDialogOpen(true);
  }, [tells.baseline]);
  // Safety net: if the camera somehow stopped between the lobby and the first hand, bring it back so tells keep flowing.
  const startCamera = tells.start;
  const hasBaseline = !!tells.baseline;
  useEffect(() => {
    if (!cameraSuppressed.current && state?.phase === "playing" && tells.status === "idle" && (hasBaseline || cameraEverOn.current)) void startCamera();
  }, [state?.phase, hasBaseline, tells.status, startCamera]);
  const leave = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    void table.leave().then((accepted) => {
      if (!accepted) { setLeaving(false); return; }
      clearIdentity(code);
      router.push("/");
    });
  }, [code, router, table, leaving]);
  // Rematch: the server seats the host at the new table; carry that identity over and go there.
  const requestRematch = table.rematch;
  const rematch = useCallback(async () => {
    const next = await requestRematch();
    if (!next) return;
    saveIdentity(next.code, { playerId: next.playerId, token: next.token, name: identity.name });
    router.push(`/table/${next.code}`);
  }, [identity.name, requestRematch, router]);

  const camera = <CameraSetup compact={state?.phase === "playing"} tells={tells} onReady={finishCamera} onSkip={skipCamera} onClose={() => setCameraDialogOpen(false)} />;

  const cameraPanel = <PlayerCameraPanel tells={tells} presage={presage} setupOpen={cameraDialogOpen} onSetup={openCamera} onStop={skipCamera} />;
  const cameraDialog = cameraDialogOpen && <CameraDialog ready={ownCameraStatus === "ready"} onDismiss={ownCameraStatus === "ready" ? () => setCameraDialogOpen(false) : skipCamera}>{camera}</CameraDialog>;

  if (!state) {
    return (
      <main className="flex flex-1 items-center justify-center text-muted">
        {table.status === "error" ? <div className="text-center"><p>Lost the table connection.</p><button onClick={() => location.reload()} className="mt-3 rounded-full bg-gold px-5 py-2 text-background">Reconnect</button></div> : <p className="animate-pulse">Connecting to the table…</p>}
      </main>
    );
  }

  if (state.phase === "lobby") return <><TableLobby state={state} playerId={identity.playerId} error={table.error} cameraStatuses={lobbyStatus.cameraStatuses} readyPlayers={lobbyStatus.readyPlayers} onReadyChange={lobbyStatus.setReady} onAddAI={table.addAI} onRemove={table.removePlayer} onUpdateConfig={table.updateConfig} onUpdateVisibility={table.updateVisibility} onStart={table.start} onLeave={leave} cameraPanel={cameraPanel} />{cameraDialog}</>;
  if (state.phase === "finished") return <FinishedTable state={state} playerId={identity.playerId} rematchCode={table.rematchCode} onRematch={rematch} error={table.error} />;


  const opponents = state.players.filter((player) => player.id !== identity.playerId);
  const detailedTells = tellAudiences(state.config.tellVisibility).humans ? opponents.filter((player) => player.kind === "human" && table.tells[player.id]) : [];
  const aiReads = opponents.filter((player) => player.kind === "ai" && table.reads[player.id]?.handNumber === hand?.handNumber);
  // The moment: the newest AI decision this hand that used a tell. Keyed by its timestamp so the banner re-animates per read.
  const callout = aiReads
    .map((player) => ({ player, read: table.reads[player.id] }))
    .filter(({ read }) => read.decision.tellsUsed.length > 0)
    .sort((a, b) => b.read.at - a.read.at)[0];
  const calloutKey = callout ? `${callout.player.id}-${callout.read.at}` : null;

  return (
    <>
    <main className={layout.game}>
      <TableHeader code={code} playerName={me?.name} status={table.status} voiceOn={state.config.voice} voice={voice} isHost={state.hostId === identity.playerId} onEnd={table.end} onLeave={leave} leaving={leaving} />
      {table.error && <p className="rounded-xl bg-danger/15 px-4 py-2 text-sm text-danger">{table.error}</p>}
      <div className={layout.workspace}>
        <section className={layout.play}>
          {callout && calloutKey && calloutKey !== calloutDone && (
            <div key={calloutKey} onAnimationEnd={() => setCalloutDone(calloutKey)} className={`${layout.callout} animate-callout flex items-start gap-2 rounded-2xl border border-gold/50 bg-background/95 px-4 py-2.5 text-sm shadow-[0_0_30px_rgba(212,175,55,0.15)]`}>
              <Eye size={16} className="mt-0.5 shrink-0 text-gold" />
              <p><span className="font-semibold text-gold">{callout.player.name}</span> <span className="text-muted">read the table on the {callout.read.street}:</span> {callout.read.decision.tellsUsed.join(" · ")}</p>
            </div>
          )}
          <OvalTable state={state} viewerSeat={me?.seat ?? null} lastActions={table.lastActions} talk={table.talk} speaking={voice.speaking} tells={table.tells} />
          <div className={layout.controls}>
            <div className="mb-2 flex min-h-7 items-center justify-between gap-2 px-2">
              {me && hand?.seats[me.seat] ? <BestHand hole={hand.seats[me.seat]!.holeCards} board={hand.board} folded={hand.seats[me.seat]!.folded} /> : <span />}
              <button type="button" aria-controls="table-info" aria-expanded={infoOpen} onClick={() => setInfoOpen((open) => !open)} className={`${layout.infoToggle} shrink-0 rounded-full border border-felt-edge px-3 py-1 text-xs text-muted`}>Table info</button>
            </div>
          <ActionBar legal={table.legal} bounds={table.bounds} pot={hand?.pot ?? 0} disabled={!myTurn || !!me?.sittingOut || !hand || hand.over || sentFor === `${hand.handNumber}:${hand.actions.length}`} onAct={onAct} />
          </div>
        </section>

        <aside id="table-info" aria-label="Table information" data-open={infoOpen} className={layout.sidebar}>
          <button type="button" onClick={() => setInfoOpen(false)} className={`${layout.closeInfo} self-end rounded-full border border-felt-edge px-3 py-1 text-xs`}>Close table info</button>
          {state.players.some((p) => state.aiModes?.[p.id] === "strategy") && <p role="status" className="rounded-xl border border-gold/40 bg-gold/10 p-3 text-xs text-gold">{state.players.filter((p) => state.aiModes?.[p.id] === "strategy").map((p) => p.name).join(", ")}: model unavailable on the last turn; the built-in strategy played instead.</p>}
          {cameraPanel}

          {detailedTells.map((player) => <OpponentTells key={player.id} player={player} tells={table.tells[player.id]} />)}

          {aiReads.length > 0 && (
            <section className="rounded-2xl border border-felt-edge p-3 text-xs">
              <h2 className="mb-2 flex items-center gap-2 text-base text-gold"><Eye size={13} /> Reads on you this hand</h2>
              <ul className="flex flex-col gap-2">{aiReads.map((player) => { const read = table.reads[player.id]; return <li key={player.id}><span className="font-medium">{player.name}</span> <span className="capitalize text-muted">· {read.street}</span><p className="mt-0.5 text-muted">{read.decision.tellsUsed.length ? read.decision.tellsUsed.join(" · ") : "No tell used. Played the odds."}</p></li>; })}</ul>
            </section>
          )}

          {table.history.length > 0 && (
            <section className="rounded-2xl border border-felt-edge p-3 text-xs">
              <h2 className="mb-2 text-base">Recent hands</h2>
              <ul className="flex flex-col gap-1.5 text-muted">{table.history.slice(-4).reverse().map((record) => <li key={record.handNumber} className="flex justify-between gap-2"><span>Hand {record.handNumber}</span><span className="truncate font-mono">{record.board.join(" ") || "preflop"}</span></li>)}</ul>
            </section>
          )}
        </aside>
      </div>
    </main>
    {cameraDialog}
    </>
  );
}

function CameraSetup({ tells, onReady, onSkip, onClose, compact = false }: { compact?: boolean; tells: ReturnType<typeof useTells>; onReady: () => void; onSkip: () => void; onClose: () => void }) {
  if (tells.baseline && tells.status === "running") {
    return <div className="p-6 text-center"><h2 className="mt-2 text-2xl font-semibold">Your baseline is captured</h2><WebcamFeed videoRef={tells.videoRef} className="mx-auto mt-5 aspect-[4/3] w-full max-w-sm" /><p className="mx-auto mt-3 max-w-md text-xs text-muted">{tells.calibrationReport ?? "Your camera is ready for the first hand."}</p><button type="button" onClick={onClose} className="mt-5 rounded-full bg-gold px-7 py-2.5 text-sm font-medium text-background">Done</button></div>;
  }
  return <Calibration compact={compact} videoRef={tells.videoRef} status={tells.status} progress={tells.calibrating?.progress ?? null} facePresent={!!tells.frame?.facePresent} onStartCamera={tells.start} onCalibrate={() => tells.calibrate().then((baseline) => baseline && onReady())} onSkip={onSkip} message={tells.calibrationReport} />;
}

function CameraDialog({ children, ready, onDismiss }: { children: React.ReactNode; ready: boolean; onDismiss: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 p-4" role="dialog" aria-modal="true" aria-label="Camera setup">
      <div className="relative w-full max-w-xl rounded-3xl bg-background shadow-2xl">
        <button type="button" onClick={onDismiss} aria-label={ready ? "Close camera setup" : "Skip camera setup"} className="absolute right-4 top-4 z-10 rounded-full border border-felt-edge bg-background/80 p-2 text-muted hover:text-foreground"><X size={16} /></button>
        {children}
      </div>
    </div>
  );
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

function TableHeader({ code, playerName, status, voiceOn, voice, isHost, onEnd, onLeave, leaving }: { code: string; playerName?: string; status: string; voiceOn: boolean; voice: ReturnType<typeof useTalk>; isHost: boolean; onEnd: () => void; onLeave: () => void; leaving: boolean }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-felt-edge bg-background/90 px-4 py-3">
      <div className="flex items-center gap-3"><div><p className="text-[10px] text-muted">Poker Face</p><p className="text-sm">Table <span className="font-mono text-gold">{code}</span></p></div><span className="text-xs text-muted">{playerName}</span><span className={`h-2 w-2 rounded-full ${status === "live" ? "bg-ok" : "bg-danger"}`} title={status} /></div>
      <div className="flex flex-wrap items-center gap-2">
        {isHost && <EndGameButton onEnd={onEnd} />}
        <button type="button" onClick={onLeave} disabled={leaving} className="rounded-full border border-felt-edge px-4 py-2 text-xs text-muted hover:border-danger hover:text-danger disabled:opacity-40">{leaving ? "Leaving…" : "Leave table"}</button>
        <button type="button" aria-label="Copy table code" onClick={() => navigator.clipboard?.writeText(code)} className="rounded-full border border-felt-edge p-2.5 text-muted hover:border-gold hover:text-foreground"><Copy size={15} /></button>
        <VoiceControls voice={voice} tableVoiceEnabled={voiceOn} />
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
