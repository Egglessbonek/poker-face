import Link from "next/link";
import { Trophy } from "lucide-react";
import type { TableState } from "@/lib/types";

export default function FinishedTable({ state, playerId }: { state: TableState; playerId: string }) {
  const standings = state.standings ?? [];
  const won = standings[0]?.playerId === playerId;
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
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href={`/reveal/${state.code}`} className="rounded-full bg-gold px-5 py-3 text-center font-semibold text-background">See the reveal</Link>
        <Link href="/table/new" className="rounded-full border border-felt-edge px-5 py-3 text-center font-medium hover:border-gold">Open another table</Link>
      </div>
    </main>
  );
}
