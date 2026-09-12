"use client";

/**
 * Spectator view: every card, every human's live tells, the AIs' stated reads, table talk, hand history.
 * Tells respect the table's `tellVisibility`; the server filters them before they reach this stream.
 */

import Link from "next/link";
import { useState } from "react";
import BluffMeter from "@/components/BluffMeter";
import TellHUD from "@/components/TellHUD";
import Oval from "@/components/table/Oval";
import { useTable } from "@/hooks/useTable";
import { useTalk } from "@/hooks/useTalk";
import type { Player } from "@/lib/types";

export default function RailDashboard({ code }: { code: string }) {
  const table = useTable(code, null, null);
  const [voice, setVoice] = useState(false);
  const talk = useTalk(table.talk, voice && (table.state?.config.voice ?? true));
  const { state } = table;

  if (!state) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 text-muted">
        {table.status === "error" ? (
          <>
            <p>No live table with code <span className="font-mono text-gold">{code}</span>.</p>
            <Link href="/rail" className="underline">try another code</Link>
          </>
        ) : (
          "Connecting to the rail…"
        )}
      </main>
    );
  }

  const humans = state.players.filter((p) => p.kind === "human");
  const ais = state.players.filter((p) => p.kind === "ai");
  const name = (id: string) => state.players.find((p) => p.id === id)?.name ?? "?";
  const seatName = (seat: number) => state.players.find((p) => p.seat === seat)?.name ?? `Seat ${seat + 1}`;

  return (
    <main className="flex flex-1 flex-col gap-3 px-3 py-4 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">
          The Rail · <span className="font-mono text-gold">{code}</span>
          <span className="ml-3 text-xs font-normal uppercase tracking-widest text-muted">{state.phase === "lobby" ? "waiting in the lobby" : state.phase === "finished" ? "match over" : table.status}</span>
        </h1>
        <div className="flex items-center gap-3 text-xs">
          <button onClick={() => setVoice((v) => !v)} className="rounded-full border border-felt-edge px-3 py-1">{voice ? "Voices on" : "Hear the AI voices"}</button>
          {state.phase === "finished" && <Link href={`/reveal/${code}`} className="rounded-full bg-gold px-3 py-1 font-medium text-background">Open the reveal</Link>}
        </div>
      </header>

      <div className="grid flex-1 gap-4 xl:grid-cols-[1fr_360px]">
        <section className="flex flex-col gap-3">
          <Oval state={state} viewerSeat={null} lastActions={table.lastActions} talk={table.talk} speaking={talk.speaking} seatExtra={(p) => (p.kind === "human" && table.tells[p.id]?.vector ? <div className="mt-1 w-full"><BluffMeter value={table.tells[p.id].vector!.bluffLikelihood} compact /></div> : null)} />

          {ais.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {ais.map((ai) => {
                const r = table.reads[ai.id];
                return (
                  <div key={ai.id} className="rounded-2xl border border-felt-edge p-3 text-xs">
                    <p className="mb-1 font-semibold text-gold">{ai.name}&apos;s read</p>
                    {r ? (
                      <>
                        <p className="text-muted">Hand {r.handNumber} · {r.street} · {r.decision.action}{r.decision.amount ? ` ${r.decision.amount}` : ""}{r.decision.mathAction !== r.decision.action && <span className="ml-1 text-gold">(math said {r.decision.mathAction})</span>}</p>
                        <p className="mt-1">{r.decision.reasoning}</p>
                        {r.decision.tellsUsed.length > 0 && <p className="mt-1 text-danger">tells used: {r.decision.tellsUsed.join(", ")}</p>}
                      </>
                    ) : (
                      <p className="text-muted">waiting for a decision…</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-3">
          {humans.map((p) => <HumanPanel key={p.id} player={p} tells={table.tells[p.id]} />)}
          {humans.length > 0 && Object.keys(table.tells).length === 0 && <p className="rounded-2xl border border-felt-edge p-3 text-xs text-muted">Tells are hidden from the rail at this table, or no camera is on yet.</p>}

          <div className="rounded-2xl border border-felt-edge p-3 text-xs">
            <p className="mb-2 font-semibold text-gold">Table talk</p>
            <ul className="flex max-h-40 flex-col gap-1 overflow-auto">
              {table.talk.slice().reverse().map((t) => (
                <li key={t.id}><span className="font-medium">{name(t.playerId)}:</span> {t.text}</li>
              ))}
              {table.talk.length === 0 && <li className="text-muted">quiet so far</li>}
            </ul>
          </div>

          <div className="rounded-2xl border border-felt-edge p-3 text-xs">
            <p className="mb-2 font-semibold text-gold">Hand history</p>
            <ul className="flex max-h-60 flex-col gap-1 overflow-auto">
              {table.history.slice().reverse().map((h) => (
                <li key={h.handNumber} className="flex justify-between gap-2">
                  <span className="text-muted">#{h.handNumber}</span>
                  <span className="flex-1 truncate">{(h.results ?? []).filter((r) => r.won > 0).map((r) => `${seatName(r.seat)} +${r.won}`).join(", ")}{h.foldedOut ? " (folds)" : ""}</span>
                  <span className="font-mono text-muted">{h.board.join(" ")}</span>
                </li>
              ))}
              {table.history.length === 0 && <li className="text-muted">no hands finished yet</li>}
            </ul>
          </div>
        </aside>
      </div>
    </main>
  );
}

function HumanPanel({ player, tells }: { player: Player; tells?: { frame: import("@/lib/types").TellFrame | null; vector: import("@/lib/types").TellVector | null } }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold">{player.name}</p>
      <TellHUD frame={tells?.frame ?? null} baseline={null} vector={tells?.vector ?? null} cameraStatus={tells ? "live" : "no feed"} />
    </div>
  );
}
