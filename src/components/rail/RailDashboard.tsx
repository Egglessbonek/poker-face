"use client";

import Link from "next/link";
import { Activity, Bot, Eye, Home, Hourglass, Radio, RefreshCw, Spade, Trophy } from "lucide-react";
import RailInspector from "./RailInspector";
import RailTable from "./RailTable";
import RailTicker from "./RailTicker";
import { useFakeRail } from "./useFakeRail";
import { useLiveRail } from "./useLiveRail";
import type { RailConnectionState, RailTableSnapshot, RailViewModel } from "./model";

function ConnectionScreen({ state, code }: { state: Exclude<RailConnectionState, "live">; code: string }) {
  const content = {
    connecting: { title: "Finding table", body: `Connecting to table ${code}…`, icon: RefreshCw },
    "not-found": { title: "No table found", body: `There is no active table using code ${code}. Check the code and try again.`, icon: Eye },
    disconnected: { title: "The feed dropped", body: "The table is still running. Reconnect to resume the broadcast.", icon: Radio },
    ended: { title: "This table has ended", body: "The final hand is complete. The Reveal shows what every face gave away.", icon: Activity },
  }[state];
  const Icon = content.icon;
  const revealHref = `/reveal/${code}`;

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.035] p-8 text-center shadow-2xl">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-gold/25 bg-gold/8">
          <Icon className={state === "connecting" ? "animate-spin text-gold" : "text-gold"} size={24} />
        </div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-gold">Poker Face Rail</p>
        <h1 className="text-2xl font-semibold text-white">{content.title}</h1>
        <p className="mt-3 leading-relaxed text-white/50">{content.body}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {state === "ended" && (
            <Link href={revealHref} className="inline-flex items-center gap-2 rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-black"><Trophy size={15} /> See the Reveal</Link>
          )}
          {state !== "connecting" && (
            <Link href="/rail" className={`${state === "ended" ? "text-white/55 hover:text-white" : "bg-gold text-black"} inline-flex rounded-full px-5 py-2.5 text-sm font-semibold`}>Enter another code</Link>
          )}
          <Link href="/" className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-white/70 transition-colors hover:border-gold/50 hover:text-gold"><Home size={15} /> Home</Link>
        </div>
      </div>
    </main>
  );
}

function RailSurface({ code, view }: { code: string; view: RailViewModel }) {
  if (view.connection !== "live" || !view.table) {
    const state = view.connection === "live" ? "disconnected" : view.connection;
    return <ConnectionScreen state={state} code={code} />;
  }

  const table = view.table;
  const humans = table.players.filter((player) => player.kind === "human");
  const ais = table.players.filter((player) => player.kind === "ai");
  const currentPlayer = table.players.find((player) => player.id === table.currentPlayerId);
  const waiting = table.phase === "lobby" || table.phase === "calibrating";
  const finished = table.phase === "finished";
  const handLabel = table.handsPerMatch > 0 ? `${table.handNumber}/${table.handsPerMatch}` : `${table.handNumber}`;

  return (
    <main className="min-h-screen flex-1 bg-[radial-gradient(circle_at_top,#14241d_0%,#0b0f0d_38%)] px-3 py-3 sm:px-5 xl:flex xl:h-dvh xl:flex-col xl:overflow-hidden">
      <header className="mx-auto mb-3 flex w-full max-w-[1600px] shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/8 pb-3">
        <div className="flex items-center gap-4">
          <div className="hidden h-9 w-9 items-center justify-center rounded-full bg-gold text-black sm:flex"><Spade size={17} fill="currentColor" /></div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-gold">Poker Face · Rail</p>
            <h1 className="mt-0.5 text-xl font-semibold text-white">Table <span className="font-mono text-gold">{code}</span></h1>
          </div>
          {finished ? (
            <span className="flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-gold">
              <Trophy size={12} /> Complete
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full border border-ok/25 bg-ok/8 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-ok">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ok" /> Live
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link href="/" aria-label="Back to home" className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-white/55 transition-colors hover:border-gold/40 hover:text-gold">
            <Home size={14} /> <span className="hidden sm:inline">Home</span>
          </Link>
          {waiting ? (
            <span className="rounded-full border border-white/8 bg-white/[0.035] px-3 py-1.5 text-white/55">Lobby</span>
          ) : (
            <>
              <span className="rounded-full border border-white/8 bg-white/[0.035] px-3 py-1.5 text-white/55">Hand <strong className="font-mono text-white">{handLabel}</strong></span>
              <span className="rounded-full border border-white/8 bg-white/[0.035] px-3 py-1.5 uppercase text-white/55">{finished ? "final" : table.street}</span>
            </>
          )}
        </div>
      </header>

      {waiting ? (
        <WaitingRoom table={table} />
      ) : (
        <div className="mx-auto grid w-full max-w-[1600px] gap-3 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start xl:overflow-hidden">
          <div className="min-w-0">
            {finished ? (
              <Link href={`/reveal/${code}`} aria-live="polite" className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/40 bg-gold px-4 py-3 text-black shadow-[0_10px_30px_rgba(212,175,55,0.25)]">
                <span className="flex items-center gap-2 text-sm font-semibold"><Trophy size={16} /> The match is over. See what every face gave away.</span>
                <span className="rounded-full bg-black/85 px-3 py-1 text-xs font-semibold text-gold">Open the Reveal →</span>
              </Link>
            ) : (
              <div className="mb-2 flex shrink-0 items-center justify-between rounded-xl border border-gold/15 bg-gold/[0.055] px-3.5 py-2">
                <div className="flex items-center gap-2 text-sm text-white/55">
                  <span className="h-2 w-2 rounded-full bg-gold shadow-[0_0_10px_rgba(212,175,55,0.8)]" />
                  {currentPlayer ? <><strong className="text-white">{currentPlayer.name}</strong> to act</> : <span>Between hands</span>}
                </div>
                <div className="font-mono text-sm text-gold">{table.turnSecondsRemaining !== null ? `${table.turnSecondsRemaining}s` : ""}</div>
              </div>
            )}
            <div className="min-h-0">{finished && table.standings?.length ? <FinalStandings table={table} /> : <RailTable table={table} />}</div>
          </div>
          <RailInspector humans={humans} ais={ais} history={view.history} currentPlayerId={table.currentPlayerId} />
        </div>
      )}
      <div className="mx-auto mt-2 hidden w-full max-w-[1600px] shrink-0 overflow-hidden rounded-xl border border-white/8 xl:block">
        <RailTicker entries={view.history} />
      </div>
    </main>
  );
}

/** Finished view: the felt is gone, the chips are counted. */
function FinalStandings({ table }: { table: RailTableSnapshot }) {
  const winner = table.standings?.[0];
  return (
    <section aria-label="Final standings" className="rounded-[2rem] border border-white/10 bg-[#0c1210] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.42)] sm:p-6">
      <div className="mb-5 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-gold">Final standings · {table.handNumber} hands</p>
        <h2 className="mt-2 text-2xl font-semibold text-white">{winner ? `${winner.name} takes the table` : "Match complete"}</h2>
        <p className="mt-1 text-sm text-white/45">The Reveal is ready with the tells behind every decision.</p>
      </div>
      <ol className="mx-auto flex w-full max-w-md flex-col gap-2">
        {table.standings?.map((s, i) => (
          <li key={s.playerId} className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${i === 0 ? "border-gold/40 bg-gold/10" : "border-white/10 bg-white/[0.035]"}`}>
            <span className="flex min-w-0 items-center gap-2.5">
              <span className={`font-mono text-sm ${i === 0 ? "text-gold" : "text-white/40"}`}>{i + 1}</span>
              {s.isAi ? <Bot size={14} className="shrink-0 text-gold" aria-label="AI player" /> : <span className="h-2 w-2 shrink-0 rounded-full bg-ok" aria-label="Human player" />}
              <span className="truncate text-sm font-semibold text-white">{s.name}</span>
            </span>
            <span className="shrink-0 font-mono text-sm text-white">${s.stack} <span className={s.net >= 0 ? "text-ok" : "text-danger"}>({s.net >= 0 ? "+" : ""}{s.net})</span></span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Lobby view: the host has not dealt yet, so there is no felt to show, only who is sitting down. */
function WaitingRoom({ table }: { table: RailTableSnapshot }) {
  const seated = [...table.players].sort((a, b) => a.seatIndex - b.seatIndex);
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-2 py-10 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-gold/25 bg-gold/8"><Hourglass className="text-gold" size={24} /></div>
      <h2 className="text-2xl font-semibold text-white">Waiting for the host to deal</h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/50">Keep this open. The felt, every card and every tell light up here the moment the first hand starts.</p>
      <ul className="mt-6 flex w-full flex-wrap justify-center gap-2" aria-label="Seated players">
        {seated.map((player) => (
          <li key={player.id} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-sm text-white/80">
            {player.kind === "ai" ? <Bot size={14} className="text-gold" aria-label="AI player" /> : <span className="h-2 w-2 rounded-full bg-ok" aria-label="Human player" />}
            {player.name}
          </li>
        ))}
        {seated.length === 0 && <li className="text-sm text-white/40">Nobody has sat down yet.</li>}
      </ul>
    </div>
  );
}

function FakeRailDashboard({ code }: { code: string }) {
  return <RailSurface code={code} view={useFakeRail(code)} />;
}

function LiveRailDashboard({ code }: { code: string }) {
  return <RailSurface code={code} view={useLiveRail(code)} />;
}

export default function RailDashboard({ code, demo = false }: { code: string; demo?: boolean }) {
  return demo
    ? <FakeRailDashboard key={`demo-${code}`} code={code} />
    : <LiveRailDashboard key={`live-${code}`} code={code} />;
}
