"use client";

import { useEffect, useState } from "react";
import { Bot, Crown, Eye, EyeOff } from "lucide-react";
import { PlayingCard } from "@/components/Card";
import type { TalkEvent } from "@/hooks/useTable";
import type { Action, HandView, Player, PlayerTells, TableState } from "@/lib/types";
import { tellAudiences } from "@/lib/tells/visibility";
import { cn } from "@/lib/utils";

const TALK_TTL_MS = 9000;

export default function OvalTable({ state, viewerSeat, lastActions, talk, speaking, tells }: { state: TableState; viewerSeat: number | null; lastActions: Record<string, Action>; talk: TalkEvent[]; speaking: string | null; tells: Record<string, PlayerTells> }) {
  const hand = state.hand;
  const anchor = viewerSeat ?? 0;
  const now = useNow(!!state.turnDeadline || talk.length > 0);
  const latestTalk = new Map<string, TalkEvent>();
  for (const item of talk) latestTalk.set(item.playerId, item);

  return (
    <div className="overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="relative mx-auto aspect-[16/10] min-w-[700px] max-w-[1000px]">
        <div className="absolute inset-[9%_7%] rounded-[50%] border-[10px] border-[#174c3b] bg-felt shadow-[inset_0_0_80px_rgba(0,0,0,0.35),0_24px_80px_rgba(0,0,0,0.35)]">
          <div className="absolute inset-3 rounded-[50%] border border-gold/15" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="flex h-20 items-center gap-2">
              {Array.from({ length: 5 }, (_, index) => hand?.board[index] ? <PlayingCard key={index} card={hand.board[index]} /> : <div key={index} className="h-20 w-14 rounded-lg border border-dashed border-white/15" />)}
            </div>
            <PotDisplay hand={hand} />
            {hand?.over && <Outcome hand={hand} players={state.players} />}
            {!hand && state.phase === "playing" && <p className="text-xs uppercase tracking-[0.24em] text-gold">Shuffling…</p>}
          </div>
        </div>

        {Array.from({ length: state.config.maxSeats }, (_, seatIndex) => {
          const player = state.players.find((item) => item.seat === seatIndex);
          const seat = hand?.seats[seatIndex] ?? null;
          const position = seatPosition(seatIndex, state.config.maxSeats, anchor);
          const chipPosition = committedPosition(seatIndex, state.config.maxSeats, anchor);
          const active = !!hand && !hand.over && hand.toAct === seatIndex;
          const timer = active && state.turnDeadline && state.config.turnTimerSec ? Math.max(0, Math.min(1, (state.turnDeadline - now) / (state.config.turnTimerSec * 1000))) : null;
          const bubble = player ? latestTalk.get(player.id) : undefined;
          return (
            <div key={seatIndex}>
              {seat && seat.committed > 0 && <div className="absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-gold/20 bg-background/90 px-2 py-0.5 font-mono text-[10px] text-gold" style={chipPosition}>{seat.committed}</div>}
              <div className="absolute z-20 w-36 -translate-x-1/2 -translate-y-1/2" style={position}>
                {bubble && now - bubble.at < TALK_TTL_MS && <div className="absolute bottom-[calc(100%+8px)] left-1/2 z-30 w-44 -translate-x-1/2 rounded-xl border border-gold/30 bg-card px-3 py-2 text-center text-[11px] leading-relaxed text-background shadow-xl">“{bubble.text}”</div>}
                {player ? (
                  <PlayerSeat
                    player={player}
                    seat={seat}
                    isMe={viewerSeat === seatIndex}
                    active={active}
                    timer={timer}
                    button={hand?.button === seatIndex}
                    action={lastActions[player.id]}
                    speaking={speaking === player.id}
                    handOver={!!hand?.over}
                    tell={tells[player.id]}
                    showTell={tellAudiences(state.config.tellVisibility).humans && player.kind === "human" && viewerSeat !== seatIndex}
                  />
                ) : (
                  <div className="flex h-16 items-center justify-center rounded-2xl border border-dashed border-felt-edge/60 bg-background/60 text-[9px] uppercase tracking-[0.22em] text-muted">Open</div>
                )}
              </div>
            </div>
          );
        })}
        {hand && <p className="absolute left-3 top-1 font-mono text-[11px] capitalize text-muted">Hand {hand.handNumber}{state.config.handsPerMatch ? `/${state.config.handsPerMatch}` : ""} · {hand.street}</p>}
      </div>
    </div>
  );
}

function PlayerSeat({ player, seat, isMe, active, timer, button, action, speaking, handOver, tell, showTell }: { player: Player; seat: HandView["seats"][number]; isMe: boolean; active: boolean; timer: number | null; button: boolean; action?: Action; speaking: boolean; handOver: boolean; tell?: PlayerTells; showTell: boolean }) {
  const folded = !!seat?.folded;
  const unavailable = !seat;
  return (
    <div className={cn("relative rounded-2xl border bg-background/95 p-2 shadow-xl transition", active ? "border-gold shadow-[0_0_28px_rgba(212,175,55,0.3)]" : speaking ? "border-card" : "border-felt-edge", (folded || unavailable) && "opacity-55", isMe && "border-gold/60")}>
      {active && timer !== null && <div className="absolute -inset-1 -z-10 rounded-[18px]" style={{ background: `conic-gradient(#d4af37 ${timer * 360}deg, rgba(212,175,55,.12) 0deg)` }} />}
      <div className="flex items-center gap-2">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${player.kind === "ai" ? "bg-chip-blue/70" : "bg-felt-edge"}`}>{player.kind === "ai" ? <Bot size={14} /> : player.name[0]}</div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 truncate text-xs font-medium">{player.name}{button && <Crown size={10} className="shrink-0 text-gold" />}</p>
          <p className="font-mono text-[10px] text-gold">{seat?.stack ?? player.stack}{seat?.allIn && !handOver ? <span className="ml-1 uppercase text-danger">all in</span> : null}</p>
        </div>
        {!player.connected && player.kind === "human" && <span className="h-2 w-2 rounded-full bg-danger" title="Disconnected" />}
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="flex gap-1">
          {seat && !folded ? [0, 1].map((index) => <PlayingCard key={index} card={seat.holeCards[index]} size="sm" />) : <span className="flex h-12 items-center text-[9px] uppercase tracking-widest text-muted">{folded ? "folded" : player.sittingOut ? "sitting out" : "waiting"}</span>}
        </div>
        <div className="min-w-0 text-right text-[9px] uppercase tracking-wide text-muted">{active && player.kind === "ai" && !handOver ? <span className="animate-pulse text-gold">thinking…</span> : action && !handOver ? `${action.type}${action.amount ? ` ${action.amount}` : ""}` : isMe ? "you" : player.kind}</div>
      </div>
      {showTell && tell ? <TellChip tells={tell} /> : showTell ? <div className="mt-2 flex items-center justify-end gap-1 border-t border-felt-edge pt-1.5 text-[9px] text-muted"><Eye size={10} /> waiting for read</div> : !isMe && player.kind === "human" ? <div className="mt-2 flex items-center justify-end gap-1 border-t border-felt-edge pt-1.5 text-[9px] text-muted"><EyeOff size={10} /> tells private</div> : null}
    </div>
  );
}

function TellChip({ tells }: { tells: PlayerTells }) {
  const value = tells.vector?.bluffLikelihood;
  return (
    <div className="mt-2 border-t border-felt-edge pt-1.5">
      <div className="flex items-center justify-between text-[9px]"><span className="flex items-center gap-1 text-muted"><Eye size={10} /> bluff read</span><span className="font-mono text-danger">{value === undefined ? "—" : `${Math.round(value * 100)}%`}</span></div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-felt-edge"><div className="h-full bg-gradient-to-r from-ok via-gold to-danger transition-[width]" style={{ width: `${(value ?? 0.5) * 100}%` }} /></div>
    </div>
  );
}

function PotDisplay({ hand }: { hand: HandView | null }) {
  if (!hand) return null;
  const pots = hand.pots?.length ? hand.pots : [{ amount: hand.pot, eligible: [] }];
  return <div className="flex flex-wrap items-center justify-center gap-2">{pots.map((pot, index) => <div key={index} className="rounded-full border border-gold/30 bg-background/75 px-4 py-1.5 text-center shadow"><span className="text-[9px] uppercase tracking-wider text-muted">{index ? `Side ${index}` : "Pot"}</span> <span className="ml-1 font-mono text-sm text-gold">{pot.amount}</span></div>)}</div>;
}

function Outcome({ hand, players }: { hand: HandView; players: Player[] }) {
  const winners = (hand.results ?? []).filter((result) => result.won > 0);
  return <div className="absolute bottom-[17%] rounded-2xl border border-gold/30 bg-background/90 px-4 py-2 text-center text-xs shadow-xl">{winners.map((result) => <p key={result.seat}><span className="font-medium">{players.find((player) => player.seat === result.seat)?.name ?? `Seat ${result.seat + 1}`}</span> wins {result.won}{result.descr && <span className="text-muted"> · {result.descr}</span>}</p>)}{hand.foldedOut && <p className="text-muted">Everyone else folded</p>}</div>;
}

function seatPosition(seat: number, count: number, anchor: number): React.CSSProperties {
  const relative = (seat - anchor + count) % count;
  const angle = Math.PI / 2 + (Math.PI * 2 * relative) / count;
  return { left: `${50 + Math.cos(angle) * 43}%`, top: `${50 + Math.sin(angle) * 43}%` };
}

function committedPosition(seat: number, count: number, anchor: number): React.CSSProperties {
  const relative = (seat - anchor + count) % count;
  const angle = Math.PI / 2 + (Math.PI * 2 * relative) / count;
  return { left: `${50 + Math.cos(angle) * 28}%`, top: `${50 + Math.sin(angle) * 27}%` };
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const interval = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(interval);
  }, [active]);
  return now;
}
