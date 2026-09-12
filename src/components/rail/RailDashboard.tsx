"use client";

import Link from "next/link";
import { Activity, Eye, Radio, RefreshCw, Spade, Users } from "lucide-react";
import RailInspector from "./RailInspector";
import RailTable from "./RailTable";
import RailTicker from "./RailTicker";
import { useFakeRail } from "./useFakeRail";
import type { RailConnectionState } from "./model";

function ConnectionScreen({ state, code }: { state: Exclude<RailConnectionState, "live">; code: string }) {
  const content = {
    connecting: { title: "Finding table", body: `Connecting to table ${code}…`, icon: RefreshCw },
    "not-found": { title: "No table found", body: `There is no active table using code ${code}. Check the code and try again.`, icon: Eye },
    disconnected: { title: "The feed dropped", body: "The table is still running. Reconnect to resume the broadcast.", icon: Radio },
    ended: { title: "This table has ended", body: "The final hand is complete. The full reveal will be available from the host.", icon: Activity },
  }[state];
  const Icon = content.icon;

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.035] p-8 text-center shadow-2xl">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-gold/25 bg-gold/8">
          <Icon className={state === "connecting" ? "animate-spin text-gold" : "text-gold"} size={24} />
        </div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-gold">Poker Face Rail</p>
        <h1 className="text-2xl font-semibold text-white">{content.title}</h1>
        <p className="mt-3 leading-relaxed text-white/50">{content.body}</p>
        {state !== "connecting" && (
          <Link href="/rail" className="mt-6 inline-flex rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-black">Enter another code</Link>
        )}
      </div>
    </main>
  );
}

export default function RailDashboard({ code }: { code: string }) {
  const view = useFakeRail(code);
  if (view.connection !== "live" || !view.table) {
    const state = view.connection === "live" ? "disconnected" : view.connection;
    return <ConnectionScreen state={state} code={code} />;
  }

  const table = view.table;
  const humans = table.players.filter((player) => player.kind === "human");
  const ais = table.players.filter((player) => player.kind === "ai");
  const currentPlayer = table.players.find((player) => player.id === table.currentPlayerId);

  return (
    <main className="min-h-screen flex-1 bg-[radial-gradient(circle_at_top,#14241d_0%,#0b0f0d_38%)] px-3 py-3 sm:px-5 xl:flex xl:h-dvh xl:flex-col xl:overflow-hidden">
      <header className="mx-auto mb-3 flex w-full max-w-[1600px] shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/8 pb-3">
        <div className="flex items-center gap-4">
          <div className="hidden h-9 w-9 items-center justify-center rounded-full bg-gold text-black sm:flex"><Spade size={17} fill="currentColor" /></div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-gold">Poker Face · Rail</p>
            <h1 className="mt-0.5 text-xl font-semibold text-white">Table <span className="font-mono text-gold">{code}</span></h1>
          </div>
          <span className="flex items-center gap-1.5 rounded-full border border-ok/25 bg-ok/8 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-ok">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ok" /> Live
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full border border-white/8 bg-white/[0.035] px-3 py-1.5 text-white/55">Hand <strong className="font-mono text-white">{table.handNumber}/{table.handsPerMatch}</strong></span>
          <span className="rounded-full border border-white/8 bg-white/[0.035] px-3 py-1.5 uppercase text-white/55">{table.street}</span>
          <span className="flex items-center gap-1.5 rounded-full border border-white/8 bg-white/[0.035] px-3 py-1.5 text-white/55"><Users size={14} />{table.spectators} watching</span>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1600px] gap-3 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-h-0 flex-col">
          <div className="mb-2 flex shrink-0 items-center justify-between rounded-xl border border-gold/15 bg-gold/[0.055] px-3.5 py-2">
            <div className="flex items-center gap-2 text-sm text-white/55">
              <span className="h-2 w-2 rounded-full bg-gold shadow-[0_0_10px_rgba(212,175,55,0.8)]" />
              <strong className="text-white">{currentPlayer?.name ?? "Table"}</strong> to act
            </div>
            <div className="font-mono text-sm text-gold">{table.turnSecondsRemaining ?? "—"}s</div>
          </div>
          <div className="min-h-0 xl:flex-1"><RailTable table={table} /></div>
        </div>
        <RailInspector humans={humans} ais={ais} history={view.history} />
      </div>
      <div className="mx-auto mt-2 hidden w-full max-w-[1600px] shrink-0 overflow-hidden rounded-xl border border-white/8 xl:block">
        <RailTicker entries={view.history} />
      </div>
    </main>
  );
}
