"use client";

import PokerTable, { type PokerSeatView } from "@/components/poker/PokerTable";
import type { TalkEvent } from "@/hooks/useTable";
import type { Action, PlayerTells, TableState } from "@/lib/types";
import { tellAudiences } from "@/lib/tells/visibility";
import { positionLabel } from "@/lib/poker/engine";

/** The seated stream has already removed opponents' private cards and reasoning. */
export default function OvalTable({ state, viewerSeat, lastActions, talk, speaking, tells }: { state: TableState; viewerSeat: number | null; lastActions: Record<string, Action>; talk: TalkEvent[]; speaking: string | null; tells: Record<string, PlayerTells> }) {
  const hand = state.hand;
  const latestTalk = new Map(talk.map((item) => [item.playerId, item]));
  const players: PokerSeatView[] = state.players.map((player) => {
    const seat = hand?.seats[player.seat];
    const position = hand && seat ? positionLabel(hand, player.seat) : "";
    const active = !!hand && !hand.over && hand.toAct === player.seat;
    const action = lastActions[player.id];
    const bubble = latestTalk.get(player.id);
    const tell = tellAudiences(state.config.tellVisibility).humans && player.kind === "human" && player.seat !== viewerSeat ? tells[player.id] : undefined;
    const value = tell?.vector?.bluffLikelihood;
    return {
      id: player.id, seat: player.seat, name: player.name, kind: player.kind,
      stack: seat?.stack ?? player.stack, committed: seat?.committed ?? 0,
      cards: seat?.holeCards ?? [], inHand: !!seat, folded: !!seat?.folded, allIn: !!seat?.allIn && !hand?.over,
      isMe: player.seat === viewerSeat, connected: player.kind === "human" ? player.connected : true,
      button: hand?.button === player.seat, blind: position.includes("SB") ? "SB" : position === "BB" ? "BB" : undefined,
      status: active && player.kind === "ai" ? "thinking…" : action && !hand?.over ? `${action.type}${action.amount ? ` ${action.amount}` : ""}` : player.sittingOut ? "sitting out" : undefined,
      speaking: speaking === player.id,
      talk: bubble ? { text: bubble.text, expiresAt: bubble.at + 9000 } : undefined,
      detail: value === undefined ? undefined : <div className="flex justify-between text-muted"><span>Bluff read</span><span className="font-mono text-gold">{Math.round(value * 100)}%</span></div>,
    };
  });
  const winners = hand?.over ? (hand.results ?? []).filter((result) => result.won > 0) : [];
  return <PokerTable
    players={players} seatCount={state.config.maxSeats} anchor={viewerSeat ?? 0}
    board={hand?.board ?? []} pots={hand?.pots?.length ? hand.pots : [{ amount: hand?.pot ?? 0 }]}
    handNumber={hand?.handNumber ?? 0} handsPerMatch={state.config.handsPerMatch} street={hand?.street ?? "Shuffling"}
    currentPlayerId={hand && !hand.over ? state.players.find((p) => p.seat === hand.toAct)?.id ?? null : null}
    turnDeadline={state.turnDeadline} turnStartedAt={state.turnStartedAt}
    outcome={winners.length ? <div>{winners.map((result) => <p key={result.seat}>{state.players.find((p) => p.seat === result.seat)?.name ?? "Player"} wins {result.won}{result.descr ? ` · ${result.descr}` : ""}</p>)}</div> : undefined}
  />;
}
