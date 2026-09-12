"use client";

import { describeModelId } from "@/lib/llm/models";
import ModelPicker from "./ModelPicker";
import type { TableState } from "@/lib/types";
import { VISIBILITY_LABEL } from "./TableConfigForm";

interface Props {
  state: TableState;
  playerId: string;
  onAddAI: (modelId: string) => void;
  onRemove: (playerId: string) => void;
  onStart: () => void;
  onLeave: () => void;
  camera: React.ReactNode;
}

export default function Lobby({ state, playerId, onAddAI, onRemove, onStart, onLeave, camera }: Props) {
  const isHost = state.hostId === playerId;
  const c = state.config;
  const free = c.maxSeats - state.players.length;
  const humans = state.players.filter((p) => p.kind === "human").length;

  return (
    <main className="flex flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gold">Lobby</p>
          <h1 className="text-3xl font-semibold">Waiting for the table to fill</h1>
          <p className="text-sm text-muted">Friends join at <span className="font-mono text-foreground">{origin()}/table/{state.code}</span> · spectators at <span className="font-mono text-foreground">/rail/{state.code}</span></p>
        </div>
        <div className="rounded-2xl border border-gold/60 bg-gold/10 px-6 py-3 text-center">
          <p className="text-[10px] uppercase tracking-[0.3em] text-gold">Table code</p>
          <p className="font-mono text-4xl tracking-[0.3em]">{state.code}</p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-medium">Seats · {state.players.length}/{c.maxSeats}</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {state.players
              .slice()
              .sort((a, b) => a.seat - b.seat)
              .map((p) => (
                <li key={p.id} className="flex items-center justify-between rounded-xl border border-felt-edge px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-background font-mono text-xs">{p.seat + 1}</span>
                    <div>
                      <p className="font-medium">
                        {p.name} {p.id === playerId && <span className="text-xs text-muted">(you)</span>} {p.id === state.hostId && <span className="text-xs text-gold">host</span>}
                      </p>
                      <p className="text-xs text-muted">{p.kind === "ai" ? `${describeModelId(p.modelId ?? "").vendor} · ${p.modelId}` : p.connected ? "connected" : "not connected yet"}</p>
                    </div>
                  </div>
                  {isHost && p.id !== state.hostId && (
                    <button onClick={() => onRemove(p.id)} className="text-xs text-muted underline">remove</button>
                  )}
                </li>
              ))}
            {Array.from({ length: free }).map((_, i) => (
              <li key={`free-${i}`} className="flex items-center gap-3 rounded-xl border border-dashed border-felt-edge/60 px-4 py-3 text-sm text-muted">
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-felt-edge/60 font-mono text-xs">·</span>
                Open seat
              </li>
            ))}
          </ul>

          {isHost && free > 0 && (
            <div>
              <p className="mb-2 text-sm text-muted">Pull up a chair for…</p>
              <ModelPicker onAdd={onAddAI} compact />
            </div>
          )}

          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-xl bg-background/60 p-4 text-sm sm:grid-cols-3">
            <Row k="Blinds" v={`${c.smallBlind}/${c.bigBlind}`} />
            <Row k="Stack" v={String(c.startingStack)} />
            <Row k="Hands" v={c.handsPerMatch ? String(c.handsPerMatch) : "until broke"} />
            <Row k="Turn timer" v={c.turnTimerSec ? `${c.turnTimerSec}s` : "off"} />
            <Row k="Tells visible to" v={VISIBILITY_LABEL[c.tellVisibility]} />
            <Row k="Voice" v={c.voice ? "on" : "off"} />
          </dl>

          <div className="flex flex-wrap items-center gap-3">
            {isHost ? (
              <button onClick={onStart} disabled={state.players.length < 2} className="rounded-xl bg-gold px-8 py-3 font-medium text-background disabled:opacity-40">
                Deal the first hand
              </button>
            ) : (
              <p className="text-sm text-muted">Waiting for the host to start…</p>
            )}
            <button onClick={onLeave} className="text-sm text-muted underline">{isHost ? "Close table" : "Leave"}</button>
            {humans === 1 && <p className="text-xs text-muted">You can start alone against the AIs, or share the code first.</p>}
          </div>
        </section>

        <aside className="flex flex-col gap-3">{camera}</aside>
      </div>
    </main>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <div className="contents">
        <dt className="text-muted">{k}</dt>
        <dd className="mb-1 font-medium">{v}</dd>
      </div>
    </>
  );
}

function origin(): string {
  return typeof window === "undefined" ? "" : window.location.host;
}
