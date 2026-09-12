/**
 * Post-match analysis built from the table log. Server only (uses Monte Carlo equity).
 * For every human decision we know the tells the AIs saw, and now also the cards, so we can
 * grade the read: was the "bluff" flag right?
 */

import "server-only";
import { monteCarloEquity } from "@/lib/poker/equity";
import type { Action, Card, Evidence, Player, Pot, HandResult, TableConfig, TableLog, TellVector, VillainDecision, OpponentView } from "@/lib/types";

export interface RevealDecision {
  handNumber: number;
  street: string;
  action: Action;
  /** Equity vs the opponents still in the hand at that moment. */
  equity: number;
  liveOpponents: number;
  aggressive: boolean;
  /** Aggressive with weak equity. */
  isBluff: boolean;
  tells: TellVector | null;
  holeCards: Card[];
  board: Card[];
}

export interface RevealPlayer {
  player: Player;
  decisions: RevealDecision[];
  /** 0-100. High = the face gave nothing away. Null without enough tell data. */
  pokerFace: number | null;
  readsRight: number;
  readsTotal: number;
  /** Most frequent evidence signals across the match. */
  leaks: Array<{ signal: string; text: string; count: number; direction: Evidence["direction"] }>;
  peakArousal: { handNumber: number; arousal: number } | null;
}

export interface TellMoment {
  handNumber: number;
  street: string;
  aiName: string;
  decision: VillainDecision;
  /** Opponents whose tells the AI saw. */
  reads: Array<{ name: string; bluffLikelihood: number; evidence: string[] }>;
}

export interface HandSummary {
  handNumber: number;
  board: Card[];
  pots?: Pot[];
  results?: HandResult[];
  foldedOut?: boolean;
  holeCards: Record<number, Card[]>;
}

export interface RevealData {
  code: string;
  config: TableConfig;
  players: Player[];
  standings: Array<{ playerId: string; name: string; stack: number; net: number }>;
  endedAt?: number;
  hands: HandSummary[];
  humans: RevealPlayer[];
  tellMoments: TellMoment[];
  aiDecisions: number;
  aiTellChanged: number;
}

interface HandStartData { handNumber: number; button: number; seats: Array<{ seat: number; playerId: string; stack: number; holeCards: Card[] }> }
interface ActionData { handNumber: number; playerId?: string; action: Action; tells: TellVector | null }
interface HandEndData { handNumber: number; board: Card[]; pots?: Pot[]; results?: HandResult[]; foldedOut?: boolean }
interface AIDecisionData { handNumber: number; street: string; playerId: string; equity: number; opponents: OpponentView[]; decision: VillainDecision }
interface TableEndData { reason: string; standings: RevealData["standings"] }

const BOARD_CARDS: Record<string, number> = { preflop: 0, flop: 3, turn: 4, river: 5, showdown: 5 };

export function buildReveal(log: TableLog): RevealData {
  const starts = new Map<number, HandStartData>();
  const ends = new Map<number, HandEndData>();
  const actions: ActionData[] = [];
  const aiDecisions: AIDecisionData[] = [];
  let standings: RevealData["standings"] = [];

  for (const e of log.entries) {
    if (e.kind === "hand_start") starts.set((e.data as HandStartData).handNumber, e.data as HandStartData);
    else if (e.kind === "hand_end") ends.set((e.data as HandEndData).handNumber, e.data as HandEndData);
    else if (e.kind === "action") actions.push(e.data as ActionData);
    else if (e.kind === "ai_decision") aiDecisions.push(e.data as AIDecisionData);
    else if (e.kind === "table_end") standings = (e.data as TableEndData).standings;
  }
  if (!standings.length) standings = [...log.players].sort((a, b) => b.stack - a.stack).map((p) => ({ playerId: p.id, name: p.name, stack: p.stack, net: p.stack - log.config.startingStack }));

  const hands: HandSummary[] = [...starts.values()].sort((a, b) => a.handNumber - b.handNumber).map((s) => {
    const end = ends.get(s.handNumber);
    const holeCards: Record<number, Card[]> = {};
    for (const seat of s.seats) holeCards[seat.seat] = seat.holeCards;
    return { handNumber: s.handNumber, board: end?.board ?? [], pots: end?.pots, results: end?.results, foldedOut: end?.foldedOut, holeCards };
  });

  // Replay each hand's actions to know how many opponents were live at each decision.
  const decisionsByPlayer = new Map<string, RevealDecision[]>();
  const folded = new Map<number, Set<number>>();
  for (const a of actions) {
    const start = starts.get(a.handNumber);
    if (!start || !a.playerId) continue;
    const f = folded.get(a.handNumber) ?? new Set<number>();
    folded.set(a.handNumber, f);
    const seat = start.seats.find((s) => s.playerId === a.playerId);
    const player = log.players.find((p) => p.id === a.playerId);
    const live = start.seats.length - f.size - 1;
    if (a.action.type === "fold") f.add(a.action.seat);
    if (!seat || !player || player.kind !== "human") continue;

    const fullBoard = ends.get(a.handNumber)?.board ?? [];
    const board = fullBoard.slice(0, BOARD_CARDS[a.action.street] ?? 0);
    const equity = monteCarloEquity(seat.holeCards, board, Math.max(1, live), 400).equity;
    const aggressive = a.action.type === "bet" || a.action.type === "raise" || a.action.type === "allin";
    const share = 1 / (Math.max(1, live) + 1);
    const isBluff = aggressive && equity < 0.8 * share;
    const list = decisionsByPlayer.get(a.playerId) ?? [];
    list.push({ handNumber: a.handNumber, street: a.action.street, action: a.action, equity, liveOpponents: Math.max(1, live), aggressive, isBluff, tells: a.tells, holeCards: seat.holeCards, board });
    decisionsByPlayer.set(a.playerId, list);
  }

  const humans: RevealPlayer[] = log.players
    .filter((p) => p.kind === "human")
    .map((player) => {
      const decisions = decisionsByPlayer.get(player.id) ?? [];
      const graded = decisions.filter((d) => d.aggressive && d.tells && d.tells.confidence > 0);
      let right = 0;
      let leakSum = 0;
      for (const d of graded) {
        const p = d.tells!.bluffLikelihood;
        const predictedBluff = p >= 0.5;
        if (predictedBluff === d.isBluff) right++;
        leakSum += d.isBluff ? p : 1 - p; // how confidently the face pointed at the truth
      }
      const pokerFace = graded.length ? Math.round(100 - (leakSum / graded.length) * 100) : null;

      const counts = new Map<string, { text: string; count: number; direction: Evidence["direction"] }>();
      let peak: RevealPlayer["peakArousal"] = null;
      for (const d of decisions) {
        if (!d.tells) continue;
        if (!peak || d.tells.arousal > peak.arousal) peak = { handNumber: d.handNumber, arousal: d.tells.arousal };
        for (const ev of d.tells.evidence) {
          const c = counts.get(ev.signal) ?? { text: ev.text, count: 0, direction: ev.direction };
          c.count++;
          counts.set(ev.signal, c);
        }
      }
      const leaks = [...counts.entries()].map(([signal, c]) => ({ signal, ...c })).sort((a, b) => b.count - a.count).slice(0, 5);
      return { player, decisions, pokerFace, readsRight: right, readsTotal: graded.length, leaks, peakArousal: peak };
    });

  const tellMoments: TellMoment[] = aiDecisions
    .filter((d) => d.decision.tellsUsed.length > 0 || d.decision.mathAction !== d.decision.action)
    .map((d) => ({
      handNumber: d.handNumber,
      street: d.street,
      aiName: log.players.find((p) => p.id === d.playerId)?.name ?? "AI",
      decision: d.decision,
      reads: d.opponents.filter((o) => o.tells && !o.folded).map((o) => ({ name: o.name, bluffLikelihood: o.tells!.bluffLikelihood, evidence: o.tells!.evidence.map((e) => e.text) })),
    }));

  return {
    code: log.code,
    config: log.config,
    players: log.players,
    standings,
    endedAt: log.endedAt,
    hands,
    humans,
    tellMoments,
    aiDecisions: aiDecisions.length,
    aiTellChanged: aiDecisions.filter((d) => d.decision.mathAction !== d.decision.action && d.decision.tellsUsed.length > 0).length,
  };
}
