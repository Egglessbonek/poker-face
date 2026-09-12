"use client";

import Link from "next/link";
import { useState } from "react";
import { RotateCcw, Trophy } from "lucide-react";
import type { TableState } from "@/lib/types";

/**
 * Final standings. The host can open a rematch (same config and AI seats at a fresh code); the other
 * humans see the new code as soon as the host does.
 */
export default function FinishedTable({ state, playerId, rematchCode, onRematch, error }: { state: TableState; playerId: string; rematchCode?: string | null; onRematch?: () => Promise<void>; error?: string | null }) {
  const standings = state.standings ?? [];
  const won = standings[0]?.playerId === playerId;
  const isHost = state.hostId === playerId;
  const [busy, setBusy] = useState(false);
  const rematch = async () => {
    if (!onRematch || busy) return;
    setBusy(true);
    try {
      await onRematch();
    } finally {
      setBusy(false);
    }
  };
  // One gold button per screen: the rematch call to action when there is one, otherwise the reveal.
  const revealIsPrimary = !isHost && !rematchCode;
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10 sm:px-8">
      <header className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gold/15 text-gold"><Trophy size={30} /></div>
        <p className="text-xs uppercase tracking-[0.32em] text-gold">Table {state.code} closed</p>
        <h1 className="mt-2 text-4xl font-semibold">{won ? "You took the table." : `${standings[0]?.name ?? "The winner"} took the table.`}</h1>
        <p className="mt-2 text-sm text-muted">Final standings after {state.handNumber} hands</p>
      </header>
      <ol className="overflow-hidden rounded-3xl border border-felt-edge">
        {standings.map((seat, index) => (
          <li key={seat.playerId} className="flex items-center gap-4 border-b border-felt-edge p-4 last:border-b-0">
            <span className={`flex h-9 w-9 items-center justify-center rounded-full font-mono text-sm ${index === 0 ? "bg-gold text-background" : "bg-felt/50 text-muted"}`}>{index + 1}</span>
            <div className="flex-1"><p className="font-medium">{seat.name}{seat.playerId === playerId ? " · You" : ""}</p><p className={`text-xs ${seat.net >= 0 ? "text-ok" : "text-danger"}`}>{seat.net >= 0 ? "+" : ""}{seat.net} net</p></div>
            <span className="font-mono text-lg text-gold">{seat.stack}</span>
          </li>
        ))}
      </ol>
      {isHost && (
        <div className="flex flex-col gap-2">
          <button type="button" onClick={rematch} disabled={busy} className="flex items-center justify-center gap-2 rounded-full bg-gold px-5 py-3 font-semibold text-background disabled:opacity-40"><RotateCcw size={16} />{busy ? "Opening a new table…" : "Rematch with the same table"}</button>
          <p className="text-center text-xs text-muted">Same stakes, same AI seats, fresh code. Everyone still here gets a link to follow you.</p>
        </div>
      )}
      {!isHost && rematchCode && (
        <section className="rounded-3xl border border-gold/50 bg-gold/10 p-5 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-gold">Rematch</p>
          <p className="mt-2">The host opened a rematch at <span className="font-mono text-gold">{rematchCode}</span></p>
          <Link href={`/table/${rematchCode}`} className="mt-4 inline-block rounded-full bg-gold px-6 py-2.5 font-semibold text-background">Join table {rematchCode}</Link>
        </section>
      )}
      {error && <p className="rounded-xl bg-danger/15 px-4 py-2 text-center text-sm text-danger">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href={`/reveal/${state.code}`} className={revealIsPrimary ? "rounded-full bg-gold px-5 py-3 text-center font-semibold text-background" : "rounded-full border border-felt-edge px-5 py-3 text-center font-medium hover:border-gold"}>See the reveal</Link>
        <Link href="/table/new" className="rounded-full border border-felt-edge px-5 py-3 text-center font-medium hover:border-gold">Open another table</Link>
      </div>
    </main>
  );
}
