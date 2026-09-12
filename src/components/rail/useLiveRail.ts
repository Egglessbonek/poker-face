"use client";

/**
 * Live rail: adapts the table stream (useTable, rail view) into the RailViewModel the dashboard renders.
 * The server already filters what the rail may see (all cards; tells per the table's tellVisibility).
 */

import { useEffect, useMemo, useState } from "react";
import { useTable, type ActionEvent, type AIRead, type HandRecord, type TalkEvent } from "@/hooks/useTable";
import { positionLabel } from "@/lib/poker/engine";
import type { Action, Card, Suit, TableState, TellFrame, TellVector } from "@/lib/types";
import type { RailCard, RailHistoryEntry, RailPlayerView, RailTableSnapshot, RailTell, RailViewModel } from "./model";

const SUITS: Record<Suit, RailCard["suit"]> = { s: "spades", h: "hearts", d: "diamonds", c: "clubs" };

function toRailCard(card: Card): RailCard {
  return { rank: card.slice(0, -1), suit: SUITS[card.slice(-1) as Suit] };
}

function dominantEmotion(frame: TellFrame | null): string {
  if (!frame) return "neutral";
  let result = "neutral";
  let highest = -1;
  for (const [emotion, score] of Object.entries(frame.emotion)) {
    if (score > highest) {
      result = emotion;
      highest = score;
    }
  }
  return result;
}

function toRailTell(frame: TellFrame | null, vector: TellVector | null): RailTell | undefined {
  if (!frame && !vector) return undefined;
  return {
    arousal: vector?.arousal ?? Math.round((frame?.tension ?? 0) * 100),
    bluffLikelihood: Math.round((vector?.bluffLikelihood ?? 0.5) * 100),
    confidence: Math.round((vector?.confidence ?? frame?.confidence ?? 0) * 100),
    trend: vector?.trend ?? "stable",
    evidence: vector?.evidence.map((item) => item.text) ?? [],
    emotion: dominantEmotion(frame),
  };
}

function actionText(action: Action): string {
  const label = action.type === "allin" ? "All-in" : action.type.charAt(0).toUpperCase() + action.type.slice(1);
  return action.amount === undefined || action.type === "fold" || action.type === "check" ? label : `${label} ${action.amount}`;
}

const VISIBILITY: Record<TableState["config"]["tellVisibility"], RailTableSnapshot["tellVisibility"]> = {
  ai_and_rail: "rail",
  rail_only: "rail",
  everyone: "everyone",
  ai_only: "ai-only",
  off: "ai-only",
};

function toSnapshot(state: TableState, tells: ReturnType<typeof useTable>["tells"], reads: Record<string, AIRead>, lastActions: Record<string, Action>, talk: TalkEvent[], now: number): RailTableSnapshot {
  const hand = state.hand;
  const latestTalk = new Map<string, string>();
  for (const t of talk) if (now - t.at < 9000) latestTalk.set(t.playerId, t.text);
  const humans = state.players.filter((p) => p.kind === "human").map((p) => p.name);

  const players: RailPlayerView[] = [...state.players]
    .sort((a, b) => a.seat - b.seat)
    .map((p) => {
      const seat = hand?.seats[p.seat] ?? null;
      const inHand = !!seat;
      const read = p.kind === "ai" ? reads[p.id] : undefined;
      const last = lastActions[p.id];
      const dealt = hand ? hand.seats.map((s, i) => (s ? i : -1)).filter((i) => i >= 0) : [];
      const isHeadsUp = dealt.length === 2;
      const sbSeat = hand ? (isHeadsUp ? hand.button : dealt[(dealt.indexOf(hand.button) + 1) % dealt.length]) : -1;
      const bbSeat = hand ? dealt[(dealt.indexOf(sbSeat) + 1) % dealt.length] : -1;
      return {
        id: p.id,
        name: p.name,
        kind: p.kind,
        persona: p.modelId,
        seatIndex: p.seat,
        stack: seat ? seat.stack : p.stack,
        committed: seat?.committed ?? 0,
        cards: seat ? seat.holeCards.map(toRailCard) : [],
        cardsVisible: !!seat && seat.holeCards.length > 0,
        folded: !inHand || !!seat?.folded,
        allIn: !!seat?.allIn,
        position: hand && inHand ? positionLabel(hand, p.seat) : p.sittingOut ? "OUT" : "",
        isButton: hand?.button === p.seat,
        isSmallBlind: inHand && sbSeat === p.seat,
        isBigBlind: inHand && bbSeat === p.seat,
        lastAction: last && !hand?.over ? actionText(last) : undefined,
        talk: latestTalk.get(p.id),
        tell: p.kind === "human" && tells[p.id] ? toRailTell(tells[p.id].frame, tells[p.id].vector) : undefined,
        aiRead: read && read.handNumber === hand?.handNumber
          ? { mathAction: read.decision.mathAction, finalAction: read.decision.action, target: humans.join(", ") || "the table", reasoning: read.decision.reasoning, tellsUsed: read.decision.tellsUsed }
          : undefined,
      };
    });

  const pots = hand
    ? (hand.pots && hand.pots.length ? hand.pots : [{ amount: hand.pot, eligible: hand.seats.map((s, i) => (s && !s.folded ? i : -1)).filter((i) => i >= 0) }]).map((pot, i, all) => ({
        id: `pot-${i}`,
        label: all.length === 1 ? "Pot" : i === 0 ? "Main pot" : `Side pot ${i}`,
        amount: pot.amount,
        eligiblePlayerIds: pot.eligible.map((seat) => state.players.find((p) => p.seat === seat)?.id ?? String(seat)),
      }))
    : [];

  const toAct = hand && !hand.over && hand.toAct !== null ? state.players.find((p) => p.seat === hand.toAct)?.id ?? null : null;
  return {
    code: state.code,
    phase: state.phase,
    handNumber: state.handNumber,
    handsPerMatch: state.config.handsPerMatch,
    street: hand?.street ?? "preflop",
    board: hand?.board.map(toRailCard) ?? [],
    pots,
    currentPlayerId: toAct,
    turnSecondsRemaining: toAct && state.turnDeadline ? Math.max(0, Math.ceil((state.turnDeadline - now) / 1000)) : null,
    spectators: 0,
    tellVisibility: VISIBILITY[state.config.tellVisibility],
    players,
  };
}

function buildHistory(state: TableState | null, actions: ActionEvent[], talk: TalkEvent[], hands: HandRecord[]): RailHistoryEntry[] {
  if (!state) return [];
  const name = (id: string) => state.players.find((p) => p.id === id)?.name ?? "?";
  const seatName = (seat: number) => state.players.find((p) => p.seat === seat)?.name ?? `Seat ${seat + 1}`;
  const entries: Array<RailHistoryEntry & { order: number }> = [];
  for (const a of actions) entries.push({ id: `act-${a.id}`, handNumber: a.handNumber, street: a.action.street, playerName: name(a.playerId), message: `${name(a.playerId)} ${actionText(a.action).toLowerCase()}`, tone: "action", order: a.action.at });
  for (const t of talk) entries.push({ id: `talk-${t.id}`, handNumber: t.handNumber, street: "preflop", playerName: name(t.playerId), message: t.text, tone: "talk", order: t.at });
  for (const h of hands) {
    const winners = (h.results ?? []).filter((r) => r.won > 0).map((r) => `${seatName(r.seat)} +${r.won}${r.descr ? ` (${r.descr})` : ""}`).join(", ");
    const lastAction = actions.filter((a) => a.handNumber === h.handNumber).at(-1)?.action.at ?? 0;
    entries.push({ id: `hand-${h.handNumber}`, handNumber: h.handNumber, street: "showdown", message: h.foldedOut ? `Hand ${h.handNumber}: ${winners} as everyone else folded` : `Hand ${h.handNumber}: ${winners}`, tone: "result", order: lastAction + 1 });
  }
  entries.sort((a, b) => a.order - b.order);
  return entries.slice(-100).map(({ order: _o, ...e }) => {
    void _o;
    return e;
  });
}

export function useLiveRail(code: string): RailViewModel {
  const table = useTable(code, null, null);
  const { state, status, tells, reads, lastActions, talk, actions, history } = table;
  const [now, setNow] = useState(() => Date.now());

  // Tick once a second while a turn clock is running so the countdown moves.
  useEffect(() => {
    if (!state?.turnDeadline) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state?.turnDeadline]);

  const connection: RailViewModel["connection"] = status === "live" ? "live" : status === "ended" ? "ended" : status === "error" ? (state ? "disconnected" : "not-found") : "connecting";

  const snapshot = useMemo(() => (state ? toSnapshot(state, tells, reads, lastActions, talk, now) : null), [state, tells, reads, lastActions, talk, now]);
  const railHistory = useMemo(() => buildHistory(state, actions, talk, history), [state, actions, talk, history]);

  return { connection, table: snapshot, history: railHistory };
}
