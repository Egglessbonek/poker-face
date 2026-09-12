"use client";

import { Bot, Copy, Crown, Eye, LogOut, Plus, Trash2, Users } from "lucide-react";
import ModelPicker from "@/components/table/ModelPicker";
import { TIERS, describeModelId, tierOf } from "@/lib/llm/models";
import type { TableState } from "@/lib/types";

const tellLabel: Record<TableState["config"]["tellVisibility"], string> = {
  ai_and_rail: "AI players and the rail",
  everyone: "Everyone at the table",
  ai_only: "AI players only",
  rail_only: "The rail only",
  off: "Nobody",
};

export default function TableLobby({ state, playerId, camera, onAddAI, onRemove, onStart, onLeave }: { state: TableState; playerId: string; camera: React.ReactNode; onAddAI: (modelId: string) => void; onRemove: (playerId: string) => void; onStart: () => void; onLeave: () => void }) {
  const isHost = state.hostId === playerId;
  const openSeats = state.config.maxSeats - state.players.length;
  /** Labelled as a casual or pro table only when every AI seat sits in that one tier. */
  const seatedTiers = new Set(state.players.filter((player) => player.kind === "ai" && player.modelId).map((player) => tierOf(player.modelId ?? "")));
  const tableTier = seatedTiers.size === 1 ? TIERS.find((tier) => seatedTiers.has(tier.id)) : undefined;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs uppercase tracking-[0.32em] text-gold">The room is open</p>
          <h1 className="mt-2 text-4xl font-semibold">Table <span className="font-mono text-gold">{state.code}</span></h1>
          <p className="mt-2 text-sm text-muted">Players and spectators use the same code. Only seated players receive private cards.</p>
        </div>
        <button type="button" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/table/${state.code}`)} className="flex items-center justify-center gap-2 rounded-full border border-felt-edge px-5 py-2.5 text-sm hover:border-gold"><Copy size={15} /> Copy invite</button>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-3xl border border-felt-edge bg-felt/20 p-5 sm:p-7">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-medium"><Users size={17} className="text-gold" /> Players</h2>
            <span className="font-mono text-xs text-muted">{state.players.length}/{state.config.maxSeats}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[...state.players].sort((a, b) => a.seat - b.seat).map((player) => {
              const model = player.modelId ? describeModelId(player.modelId) : null;
              return (
                <div key={player.id} className="flex min-h-20 items-center gap-3 rounded-2xl border border-felt-edge bg-background/50 p-3">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${player.kind === "ai" ? "bg-chip-blue/60" : "bg-felt-edge"}`}>{player.kind === "ai" ? <Bot size={19} /> : player.name.slice(0, 1).toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium">{player.name}{player.id === playerId && <span className="text-xs text-muted">(you)</span>}{player.id === state.hostId && <Crown size={13} className="shrink-0 text-gold" />}</p>
                    <p className="truncate text-xs text-muted">{model ? `${model.vendor} · ${player.modelId}` : player.connected ? "Human · connected" : "Human · reconnecting"}</p>
                  </div>
                  {isHost && player.id !== state.hostId && <button type="button" aria-label={`Remove ${player.name}`} onClick={() => onRemove(player.id)} className="rounded-lg p-2 text-muted hover:bg-danger/10 hover:text-danger"><Trash2 size={15} /></button>}
                </div>
              );
            })}
            {Array.from({ length: Math.min(openSeats, 4) }, (_, index) => <div key={index} className="flex min-h-20 items-center justify-center rounded-2xl border border-dashed border-felt-edge text-xs text-muted">Open seat</div>)}
          </div>

          {isHost && openSeats > 0 && (
            <div className="mt-5 border-t border-felt-edge/60 pt-5">
              <p className="mb-3 flex items-center gap-2 text-sm text-muted"><Plus size={14} /> Pull up a chair for another model</p>
              <ModelPicker onAdd={onAddAI} compact />
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-4">
          <section className="flex flex-col gap-5 rounded-3xl border border-felt-edge p-5">
            <div><p className="flex items-center justify-between text-xs uppercase tracking-wider text-muted"><span>Game</span>{tableTier && <span title={tableTier.blurb} className="rounded border border-felt-edge px-1.5 py-0.5 text-[10px] text-gold">{tableTier.label}</span>}</p><p className="mt-1 text-lg">{state.config.smallBlind}/{state.config.bigBlind} No-Limit Hold’em</p></div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Stat label="Stack" value={state.config.startingStack} />
              <Stat label="Hands" value={state.config.handsPerMatch || "∞"} />
              <Stat label="Clock" value={state.config.turnTimerSec ? `${state.config.turnTimerSec}s` : "off"} />
              <Stat label="Seats" value={state.config.maxSeats} />
            </dl>
            <div className="flex gap-3 rounded-2xl bg-felt/30 p-3 text-xs text-muted"><Eye size={17} className="shrink-0 text-gold" /><p>Tells visible to {tellLabel[state.config.tellVisibility].toLowerCase()}.</p></div>
            {isHost ? <button type="button" onClick={onStart} disabled={state.players.length < 2} className="rounded-full bg-gold py-3 font-semibold text-background disabled:opacity-40">Deal the first hand</button> : <p className="rounded-2xl border border-felt-edge p-3 text-center text-xs text-muted">Waiting for the host to start…</p>}
            <button type="button" onClick={onLeave} className="flex items-center justify-center gap-2 text-xs text-muted hover:text-foreground"><LogOut size={13} /> {isHost ? "Close table" : "Leave table"}</button>
          </section>
          {camera}
        </aside>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl bg-felt/25 p-3"><dt className="text-[10px] uppercase tracking-wider text-muted">{label}</dt><dd className="mt-1 font-mono text-gold">{value}</dd></div>;
}
