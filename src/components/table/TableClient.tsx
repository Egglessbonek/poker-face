"use client";

/**
 * A seated player's view of a table: join -> lobby (camera + calibration) -> play -> finished.
 * Owns the camera pipeline, streams tells to the server at ~2Hz, and attaches a TellVector to every action.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ActionBar from "@/components/ActionBar";
import BluffMeter from "@/components/BluffMeter";
import Calibration from "@/components/Calibration";
import WebcamFeed from "@/components/WebcamFeed";
import JoinForm from "@/components/table/JoinForm";
import Lobby from "@/components/table/Lobby";
import Oval from "@/components/table/Oval";
import { useTable } from "@/hooks/useTable";
import { useTalk } from "@/hooks/useTalk";
import { useTells } from "@/hooks/useTells";
import { clearIdentity, loadIdentity, type Identity } from "@/lib/client/identity";
import { createCursorTracker } from "@/lib/tells/cursor";
import { dominantEmotion } from "@/lib/tells/emotion";
import { fuseTells } from "@/lib/tells/fuse";
import type { ActionType, Player, PlayerTells, TellVector } from "@/lib/types";

export default function TableClient({ code }: { code: string }) {
  const [identity, setIdentity] = useState<Identity | null | undefined>(undefined);
  const [gone, setGone] = useState<string | null>(null);

  useEffect(() => {
    const id = loadIdentity(code);
    const url = `/api/table/${code}${id ? `?token=${encodeURIComponent(id.token)}` : ""}`;
    fetch(url)
      .then((r) => {
        if (r.status === 404) {
          setGone("No table with that code. It may have closed, or the server restarted.");
          if (id) clearIdentity(code);
          setIdentity(null);
        } else if (r.status === 401) {
          clearIdentity(code);
          setIdentity(null);
        } else setIdentity(id);
      })
      .catch(() => setIdentity(id));
  }, [code]);

  if (gone)
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-gold">Table {code}</p>
        <p className="text-lg">{gone}</p>
        <Link href="/" className="rounded-full bg-gold px-6 py-2 font-medium text-background">Back to the lobby</Link>
      </main>
    );
  if (identity === undefined) return <main className="flex flex-1 items-center justify-center text-muted">Finding your seat…</main>;
  if (identity === null) return <JoinForm code={code} onJoined={setIdentity} />;
  return <Seated code={code} identity={identity} />;
}

function Seated({ code, identity }: { code: string; identity: Identity }) {
  const router = useRouter();
  const table = useTable(code, identity.token, identity.playerId);
  const tells = useTells();
  const voiceOn = table.state?.config.voice ?? true;
  const talk = useTalk(table.talk, voiceOn);
  const cursor = useMemo(() => createCursorTracker(), []);
  const [lastVector, setLastVector] = useState<TellVector | null>(null);
  const [cameraDone, setCameraDone] = useState(false);
  const vectorHistory = useRef<TellVector[]>([]);
  const promptedAt = useRef<number>(0);
  const wasMyTurn = useRef(false);
  const prevRevealKey = useRef("");
  const lastTellsSent = useRef(0);

  const { state, hand, me, myTurn } = table;
  const phase = state?.phase;

  // Baseline -> server (for the reveal).
  useEffect(() => {
    if (tells.baseline) table.sendTells({ baseline: tells.baseline });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tells.baseline?.calibratedAt]);

  // Card reveals feed reaction scoring.
  useEffect(() => {
    if (!hand || !me) return;
    const mine = hand.seats[me.seat];
    const key = `${hand.handNumber}:${hand.board.length}:${mine?.holeCards.join("") ?? ""}`;
    if (key === prevRevealKey.current) return;
    prevRevealKey.current = key;
    if (!mine) return;
    if (hand.board.length === 0 && mine.holeCards.length) tells.markReveal("hole");
    else if (hand.board.length === 3) tells.markReveal("flop");
    else if (hand.board.length === 4) tells.markReveal("turn");
    else if (hand.board.length === 5) tells.markReveal("river");
  }, [hand, me, tells]);

  // Decision window starts when it becomes my turn.
  useEffect(() => {
    if (myTurn && !wasMyTurn.current) {
      promptedAt.current = Date.now();
      cursor.start();
    }
    wasMyTurn.current = myTurn;
  }, [myTurn, cursor]);

  // Stream live tells to the server at ~2Hz while playing.
  useEffect(() => {
    if (phase !== "playing" || !tells.frame) return;
    const now = Date.now();
    if (now - lastTellsSent.current < 500) return;
    lastTellsSent.current = now;
    table.sendTells({ frame: tells.frame, vector: lastVector });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tells.frame, phase]);

  const onAct = useCallback(
    (type: ActionType, amount?: number) => {
      if (!hand) return;
      const latency = Date.now() - promptedAt.current;
      let vector: TellVector | null = null;
      if (tells.status === "running" && tells.baselineRef.current) {
        const snap = tells.snapshot(promptedAt.current, { handNumber: hand.handNumber, street: hand.street, decisionLatencyMs: latency, cursor: cursor.finish() });
        vector = fuseTells(snap, tells.baselineRef.current, vectorHistory.current);
        vectorHistory.current = [...vectorHistory.current.slice(-20), vector];
        tells.noteLatency(latency);
        setLastVector(vector);
      }
      void table.act(type, amount, latency, vector);
    },
    [hand, tells, cursor, table],
  );

  const camera = (
    <CameraSetup
      tells={tells}
      done={cameraDone}
      onDone={() => setCameraDone(true)}
    />
  );

  if (!state) {
    return (
      <main className="flex flex-1 items-center justify-center text-muted">
        {table.status === "error" ? (
          <div className="text-center">
            <p>Lost the table connection.</p>
            <button onClick={() => location.reload()} className="mt-3 rounded-full bg-gold px-5 py-2 text-background">Reconnect</button>
          </div>
        ) : (
          "Connecting to the table…"
        )}
      </main>
    );
  }

  if (phase === "lobby") {
    return <Lobby state={state} playerId={identity.playerId} onAddAI={table.addAI} onRemove={table.removePlayer} onStart={table.start} onLeave={() => table.leave().then(() => { clearIdentity(code); router.push("/"); })} camera={camera} />;
  }

  if (phase === "finished") return <Finished code={code} state={state} playerId={identity.playerId} />;

  const others = state.players.filter((p) => p.id !== identity.playerId);
  const showOpponentTells = state.config.tellVisibility === "everyone";
  const aiReads = others.filter((p) => p.kind === "ai" && table.reads[p.id]?.handNumber === hand?.handNumber);

  return (
    <main className="flex flex-1 flex-col gap-3 px-3 py-4 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-3">
          <span className="rounded-lg border border-felt-edge px-3 py-1 font-mono">Table <span className="text-gold">{code}</span></span>
          <span className="text-muted">{me?.name}{me?.sittingOut ? " · sitting out" : ""}</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {voiceOn && (
            <button onClick={() => talk.setMuted(!talk.muted)} className="rounded-full border border-felt-edge px-3 py-1">
              {talk.muted ? "Unmute AI voices" : talk.unavailable ? "Voice unavailable" : "Mute AI voices"}
            </button>
          )}
          <a href={`/rail/${code}`} target="_blank" rel="noreferrer" className="text-muted underline">rail view</a>
          {!me?.sittingOut && <button onClick={() => table.leave()} className="text-muted underline">sit out</button>}
        </div>
      </header>
      {table.error && <p className="rounded-lg bg-danger/20 px-3 py-2 text-sm text-danger">{table.error}</p>}

      <div className="grid flex-1 gap-4 lg:grid-cols-[1fr_300px]">
        <section className="flex flex-col gap-3">
          <Oval state={state} viewerSeat={me?.seat ?? null} lastActions={table.lastActions} talk={table.talk} speaking={talk.speaking} />
          {hand && !hand.over && me && !me.sittingOut && (
            <ActionBar legal={table.legal} bounds={table.bounds} pot={hand.pot} disabled={!myTurn} onAct={onAct} cursor={cursor} />
          )}
          {hand?.over && <p className="text-center text-xs text-muted">next hand in a moment…</p>}
        </section>

        <aside className="flex flex-col gap-3">
          <div className="rounded-2xl border border-felt-edge p-3">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-semibold text-gold">Your camera</span>
              <span className="font-mono uppercase text-muted">{tells.status}{tells.frame && !tells.frame.facePresent ? " · no face" : ""}</span>
            </div>
            {cameraDone || tells.baseline ? (
              <>
                <WebcamFeed videoRef={tells.videoRef} className="aspect-[4/3] w-full" />
                <p className="mt-2 text-xs text-muted">
                  {tells.status === "running" ? (tells.baseline ? "Calibrated. The table is reading you." : "Camera on, no baseline: tells are coarse.") : "Camera off. The AIs play you blind."}
                </p>
              </>
            ) : (
              camera
            )}
          </div>

          {showOpponentTells && others.filter((p) => p.kind === "human" && table.tells[p.id]).map((p) => <OpponentTells key={p.id} player={p} tells={table.tells[p.id]} />)}

          {aiReads.length > 0 && (
            <div className="rounded-2xl border border-felt-edge p-3 text-xs">
              <p className="mb-2 font-semibold text-gold">What the AIs picked up</p>
              <ul className="flex flex-col gap-1.5">
                {aiReads.map((p) => {
                  const r = table.reads[p.id];
                  return (
                    <li key={p.id}>
                      <span className="font-medium">{p.name}</span> <span className="text-muted">{r.street}</span>: {r.decision.tellsUsed.length ? r.decision.tellsUsed.join(", ") : "playing the math"}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}

function CameraSetup({ tells, done, onDone }: { tells: ReturnType<typeof useTells>; done: boolean; onDone: () => void }) {
  if (done || tells.baseline) {
    return (
      <div className="rounded-2xl border border-felt-edge p-3">
        <p className="mb-2 text-xs font-semibold text-gold">Your camera</p>
        <WebcamFeed videoRef={tells.videoRef} className="aspect-[4/3] w-full" />
        <p className="mt-2 text-xs text-muted">{tells.baseline ? "Baseline captured. You are ready." : tells.status === "running" ? "Camera on without a baseline." : "Playing without a camera."}</p>
        {!tells.baseline && tells.status === "running" && (
          <button onClick={() => tells.calibrate().then(onDone)} className="mt-2 w-full rounded-lg border border-felt-edge py-1.5 text-xs">Capture a 10s baseline</button>
        )}
      </div>
    );
  }
  return (
    <Calibration
      videoRef={tells.videoRef}
      status={tells.status}
      progress={tells.calibrating?.progress ?? null}
      facePresent={!!tells.frame?.facePresent}
      onStartCamera={tells.start}
      onCalibrate={() => tells.calibrate().then(onDone)}
      onSkip={onDone}
    />
  );
}

function OpponentTells({ player, tells }: { player: Player; tells: PlayerTells }) {
  const v = tells.vector;
  const f = tells.frame;
  return (
    <div className="rounded-2xl border border-felt-edge p-3 text-xs">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-semibold">{player.name}</span>
        <span className="font-mono text-muted">{f ? (f.facePresent ? dominantEmotion(f.emotion) : "no face") : "—"}</span>
      </div>
      {v ? (
        <>
          <BluffMeter value={v.bluffLikelihood} />
          <p className="text-muted">arousal {v.arousal} · {v.trend}</p>
          {v.evidence.slice(0, 2).map((e, i) => (
            <p key={i} className={e.direction === "bluff" ? "text-danger" : e.direction === "strength" ? "text-ok" : "text-muted"}>• {e.text}</p>
          ))}
        </>
      ) : (
        <p className="text-muted">{f ? `blink ${f.blinkRate.toFixed(0)}/min · tension ${Math.round(f.tension * 100)}%` : "no read yet"}</p>
      )}
    </div>
  );
}

function Finished({ code, state, playerId }: { code: string; state: NonNullable<ReturnType<typeof useTable>["state"]>; playerId: string }) {
  const standings = state.standings ?? [];
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-12">
      <p className="text-xs uppercase tracking-[0.3em] text-gold">Table {code} · match over</p>
      <h1 className="text-3xl font-semibold">{standings[0]?.playerId === playerId ? "You took the table." : `${standings[0]?.name ?? "Someone"} took the table.`}</h1>
      <ol className="w-full max-w-md divide-y divide-felt-edge rounded-2xl border border-felt-edge">
        {standings.map((s, i) => (
          <li key={s.playerId} className="flex items-center justify-between px-4 py-3">
            <span><span className="mr-3 font-mono text-muted">{i + 1}</span>{s.name}{s.playerId === playerId && <span className="ml-2 text-xs text-muted">(you)</span>}</span>
            <span className="font-mono">{s.stack} <span className={s.net >= 0 ? "text-ok" : "text-danger"}>({s.net >= 0 ? "+" : ""}{s.net})</span></span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-3">
        <Link href={`/reveal/${code}`} className="rounded-full bg-gold px-8 py-3 font-medium text-background">See what your face gave away</Link>
        <Link href="/table/new" className="rounded-full border border-felt-edge px-8 py-3 font-medium">New table</Link>
      </div>
    </main>
  );
}
