"use client";

/**
 * The table: seats around an ellipse, own seat (or seat 1 for the rail) at the bottom.
 * Pure presentation; all state comes from useTable.
 */

import { useEffect, useState } from "react";
import { PlayingCard } from "@/components/Card";
import type { TalkEvent } from "@/hooks/useTable";
import type { Action, HandView, Player, TableState } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  state: TableState;
  viewerSeat: number | null;
  lastActions: Record<string, Action>;
  talk: TalkEvent[];
  speaking: string | null;
  /** Optional extra content rendered under a seat (e.g. an opponent's tell chip). */
  seatExtra?: (player: Player) => React.ReactNode;
}

const TALK_TTL_MS = 9000;

export default function Oval({ state, viewerSeat, lastActions, talk, speaking, seatExtra }: Props) {
  const hand = state.hand;
  const n = state.config.maxSeats;
  const anchor = viewerSeat ?? 0;
  const now = useNow(!!state.turnDeadline || talk.length > 0);

  const latestTalk = new Map<string, TalkEvent>();
  for (const t of talk) latestTalk.set(t.playerId, t);

  return (
    <div className="relative mx-auto aspect-[4/3] w-full max-w-4xl sm:aspect-[16/9]">
      {/* felt */}
      <div className="absolute inset-[9%] rounded-[50%] border-[10px] border-felt-edge bg-felt shadow-[inset_0_0_80px_rgba(0,0,0,0.45)]" />

      {/* board + pot */}
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
        <div className="flex gap-1.5 sm:gap-2">
          {[0, 1, 2, 3, 4].map((i) => (hand?.board[i] ? <PlayingCard key={i} card={hand.board[i]} size="md" /> : <div key={i} className="h-20 w-14 rounded-lg border border-dashed border-felt-edge/60" />))}
        </div>
        <PotLine hand={hand} />
        {hand?.over && <Outcome hand={hand} players={state.players} />}
        {!hand && state.phase === "playing" && <p className="text-xs uppercase tracking-widest text-gold">shuffling…</p>}
      </div>

      {/* seats */}
      {Array.from({ length: n }).map((_, seat) => {
        const k = (seat - anchor + n) % n;
        const angle = Math.PI / 2 + (k * 2 * Math.PI) / n;
        const x = 50 + 46 * Math.cos(angle);
        const y = 50 + 44 * Math.sin(angle);
        const cx = 50 + 27 * Math.cos(angle);
        const cy = 50 + 26 * Math.sin(angle);
        const player = state.players.find((p) => p.seat === seat);
        const s = hand?.seats[seat] ?? null;
        const isTurn = !!hand && !hand.over && hand.toAct === seat;
        const deadlineFrac = isTurn && state.turnDeadline && state.config.turnTimerSec ? Math.max(0, Math.min(1, (state.turnDeadline - now) / (state.config.turnTimerSec * 1000))) : null;
        const action = player ? lastActions[player.id] : undefined;
        const bubble = player ? latestTalk.get(player.id) : undefined;
        const showBubble = bubble && now - bubble.at < TALK_TTL_MS;
        const isMe = viewerSeat === seat;
        return (
          <div key={seat}>
            {s && s.committed > 0 && (
              <div className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-background/80 px-2 py-0.5 font-mono text-[11px] text-gold" style={{ left: `${cx}%`, top: `${cy}%` }}>
                {s.committed}
              </div>
            )}
            <div className="absolute flex w-[112px] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 sm:w-[140px]" style={{ left: `${x}%`, top: `${y}%` }}>
              {showBubble && (
                <div className="absolute -top-2 z-10 w-48 -translate-y-full rounded-xl bg-card px-3 py-2 text-center text-xs text-background shadow">“{bubble!.text}”</div>
              )}
              {player ? (
                <SeatCard player={player} seat={s} isTurn={isTurn} deadlineFrac={deadlineFrac} isButton={hand?.button === seat} isMe={isMe} action={action} speaking={speaking === player.id} handOver={!!hand?.over} extra={seatExtra?.(player)} />
              ) : (
                <div className="flex h-16 w-full items-center justify-center rounded-xl border border-dashed border-felt-edge/50 text-[10px] uppercase tracking-widest text-muted/60">open</div>
              )}
            </div>
          </div>
        );
      })}
      {hand && <p className="absolute left-2 top-1 font-mono text-[11px] text-muted">Hand {hand.handNumber}{state.config.handsPerMatch ? `/${state.config.handsPerMatch}` : ""} · {hand.street}</p>}
    </div>
  );
}

function SeatCard({ player, seat, isTurn, deadlineFrac, isButton, isMe, action, speaking, handOver, extra }: { player: Player; seat: HandView["seats"][number]; isTurn: boolean; deadlineFrac: number | null; isButton: boolean; isMe: boolean; action?: Action; speaking: boolean; handOver: boolean; extra?: React.ReactNode }) {
  const folded = !!seat?.folded;
  const out = !seat;
  const ring = isTurn ? (deadlineFrac === null ? "ring-2 ring-gold animate-pulse" : "") : speaking ? "ring-2 ring-card" : "";
  const timerStyle = isTurn && deadlineFrac !== null ? { background: `conic-gradient(var(--gold) ${Math.round(deadlineFrac * 360)}deg, transparent 0)` } : undefined;
  return (
    <div className={cn("relative flex w-full flex-col items-center gap-1 rounded-xl bg-background/85 px-2 py-1.5 text-center shadow-md transition", ring, (folded || out) && "opacity-50", isMe && "border border-gold/50")}>
      {timerStyle && <div className="absolute -inset-[3px] -z-10 rounded-[14px]" style={timerStyle} />}
      <div className="flex h-12 items-center gap-1 sm:h-14">
        {seat && !folded ? (
          <>
            <PlayingCard card={seat.holeCards[0]} size="sm" />
            <PlayingCard card={seat.holeCards[1]} size="sm" />
          </>
        ) : (
          <span className="text-[10px] uppercase tracking-widest text-muted">{folded ? "folded" : player.sittingOut ? "sitting out" : "waiting"}</span>
        )}
      </div>
      <p className="max-w-full truncate text-xs font-medium">
        {player.name}
        {player.kind === "ai" && <span className="ml-1 rounded bg-felt-edge px-1 text-[9px] uppercase text-foreground/80">AI</span>}
        {!player.connected && player.kind === "human" && <span className="ml-1 text-[9px] text-danger">offline</span>}
      </p>
      <p className="font-mono text-xs text-gold">{seat ? seat.stack : player.stack}{seat?.allIn && !handOver && <span className="ml-1 text-[9px] uppercase text-danger">all in</span>}</p>
      {isButton && <span className="absolute -right-2 -top-2 rounded-full bg-card px-1.5 text-[10px] font-bold text-background shadow">D</span>}
      {action && !handOver && (
        <span className={cn("absolute -bottom-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider shadow", action.type === "fold" ? "bg-danger/90" : action.type === "check" || action.type === "call" ? "bg-felt-edge" : "bg-gold text-background")}>
          {action.type}{action.amount && action.type !== "fold" && action.type !== "check" ? ` ${action.amount}` : ""}
        </span>
      )}
      {extra}
    </div>
  );
}

function PotLine({ hand }: { hand: HandView | null }) {
  if (!hand) return null;
  const pots = hand.pots && hand.pots.length > 1 ? hand.pots : null;
  return (
    <div className="flex flex-col items-center">
      <p className="font-mono text-sm text-gold">Pot {hand.pot}</p>
      {pots && <p className="font-mono text-[10px] text-muted">{pots.map((p) => p.amount).join(" + ")}</p>}
    </div>
  );
}

function Outcome({ hand, players }: { hand: HandView; players: Player[] }) {
  const name = (seat: number) => players.find((p) => p.seat === seat)?.name ?? `Seat ${seat + 1}`;
  const winners = (hand.results ?? []).filter((r) => r.won > 0);
  return (
    <div className="max-w-xs rounded-xl bg-background/85 px-4 py-2 text-center text-xs shadow">
      {winners.map((r) => (
        <p key={r.seat}>
          <span className="font-medium">{name(r.seat)}</span> wins {r.won}
          {r.descr && <span className="text-muted"> · {r.descr}</span>}
        </p>
      ))}
      {hand.foldedOut && <p className="text-muted">everyone else folded</p>}
    </div>
  );
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [active]);
  return now;
}
