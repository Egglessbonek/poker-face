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

export interface Achievement {
  id: string;
  title: string;
  blurb: string;
  tone: "gold" | "danger" | "ok" | "muted";
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
  /** Badges earned this match: at most 5, in a fixed order. See `achievements()`. */
  achievements: Achievement[];
}

export interface RevealSituation {
  board: Card[];
  pot: number;
  currentBet: number;
  toCall: number;
  aiSeat: number;
  aiStack: number;
  aiCommitted: number;
  aiPosition: string;
  aiHoleCards: Card[];
  actions: Action[];
}

export interface TellRead {
  name: string;
  bluffLikelihood: number;
  /** Null when a legacy tell record did not retain confidence. */
  confidence: number | null;
  evidence: Evidence[];
  actual: Pick<RevealDecision, "action" | "equity" | "isBluff" | "holeCards" | "board"> | null;
}

export interface TellMoment {
  handNumber: number;
  street: string;
  aiName: string;
  aiSeat: number;
  aiEquity: number;
  decision: VillainDecision;
  /** Exact table state immediately before the AI acted. Null for logs created before snapshots were added. */
  situation: RevealSituation | null;
  result: HandSummary | null;
  /** Opponents whose tells the AI saw. */
  reads: TellRead[];
  /** Present only when the AI identified a real bluff, continued against it, and won the hand. */
  caughtBluff: TellRead | null;
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
interface ActionData { handNumber: number; playerId?: string; action: Action; tells: TellVector | null; loggedAt: number }
interface HandEndData { handNumber: number; board: Card[]; pots?: Pot[]; results?: HandResult[]; foldedOut?: boolean; voided?: boolean }
interface AIDecisionData { handNumber: number; street: string; playerId: string; equity: number; opponents: OpponentView[]; decision: VillainDecision; situation?: RevealSituation; loggedAt: number }
interface TableEndData { reason: string; standings: RevealData["standings"] }

interface LoggedRevealDecision {
  decision: RevealDecision;
  loggedAt: number;
}

const BOARD_CARDS: Record<string, number> = { preflop: 0, flop: 3, turn: 4, river: 5, showdown: 5 };

export function buildReveal(log: TableLog): RevealData {
  const starts = new Map<number, HandStartData>();
  const ends = new Map<number, HandEndData>();
  const actions: ActionData[] = [];
  const aiDecisions: AIDecisionData[] = [];
  let standings: RevealData["standings"] = [];

  // A hand the host ended mid-way was voided (chips returned): it has no board and nothing in it was graded.
  const voided = new Set(log.entries.filter((e) => e.kind === "hand_end" && (e.data as HandEndData).voided).map((e) => (e.data as HandEndData).handNumber));
  for (const e of log.entries) {
    const handNumber = (e.data as { handNumber?: number })?.handNumber;
    if (handNumber !== undefined && voided.has(handNumber)) continue;
    if (e.kind === "hand_start") starts.set((e.data as HandStartData).handNumber, e.data as HandStartData);
    else if (e.kind === "hand_end") ends.set((e.data as HandEndData).handNumber, e.data as HandEndData);
    else if (e.kind === "action") actions.push({ ...(e.data as Omit<ActionData, "loggedAt">), loggedAt: e.t });
    else if (e.kind === "ai_decision") aiDecisions.push({ ...(e.data as Omit<AIDecisionData, "loggedAt">), loggedAt: e.t });
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
  const decisionsByPlayer = new Map<string, LoggedRevealDecision[]>();
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
    list.push({
      loggedAt: a.loggedAt,
      decision: { handNumber: a.handNumber, street: a.action.street, action: a.action, equity, liveOpponents: Math.max(1, live), aggressive, isBluff, tells: a.tells, holeCards: seat.holeCards, board },
    });
    decisionsByPlayer.set(a.playerId, list);
  }

  const handByNumber = new Map(hands.map((hand) => [hand.handNumber, hand]));
  const actualDecision = (d: AIDecisionData, opponent: OpponentView): TellRead["actual"] => {
    const player = log.players.find((p) => p.id === opponent.id) ?? log.players.find((p) => p.seat === opponent.seat);
    if (!player) return null;
    const candidates = decisionsByPlayer.get(player.id) ?? [];
    const priorAction = d.situation?.actions.filter((action) => action.seat === opponent.seat).at(-1);
    for (let i = candidates.length - 1; i >= 0; i--) {
      const { decision: candidate, loggedAt } = candidates[i];
      if (candidate.handNumber !== d.handNumber) continue;
      if (priorAction && candidate.action.at !== priorAction.at) continue;
      if (!priorAction && loggedAt > d.loggedAt) continue;
      return {
        action: candidate.action,
        equity: candidate.equity,
        isBluff: candidate.isBluff,
        holeCards: candidate.holeCards,
        board: candidate.board,
      };
    }
    return null;
  };
  const tellChanged = (d: AIDecisionData) => (d.decision.tellAction ?? d.decision.mathAction) !== d.decision.mathAction || (d.decision.action !== d.decision.mathAction && d.decision.tellsUsed.length > 0);
  const tellMoments: TellMoment[] = aiDecisions
    .filter(tellChanged)
    .map((d) => {
      const ai = log.players.find((p) => p.id === d.playerId);
      const result = handByNumber.get(d.handNumber) ?? null;
      const reads: TellRead[] = d.opponents.filter((o) => o.tells && !o.folded).map((o) => {
        const tell = o.tells!;
        return {
          name: o.name,
          bluffLikelihood: Number.isFinite(tell.bluffLikelihood) ? Math.max(0, Math.min(1, tell.bluffLikelihood)) : 0.5,
          confidence: Number.isFinite(tell.confidence) ? Math.max(0, Math.min(1, tell.confidence)) : null,
          evidence: Array.isArray(tell.evidence) ? tell.evidence : [],
          actual: actualDecision(d, o),
        };
      });
      const challengedBluff = d.situation ? (reads.find((read) => read.actual?.isBluff && read.bluffLikelihood >= 0.5) ?? null) : null;
      const continued = d.decision.action === "call" || d.decision.action === "raise" || d.decision.action === "allin";
      const aiWon = !!ai && !!result?.results?.some((entry) => entry.seat === ai.seat && entry.won > 0);
      return {
        handNumber: d.handNumber,
        street: d.street,
        aiName: ai?.name ?? "AI",
        aiSeat: ai?.seat ?? d.situation?.aiSeat ?? -1,
        aiEquity: d.equity,
        decision: d.decision,
        situation: d.situation ?? null,
        result,
        reads,
        caughtBluff: continued && aiWon ? challengedBluff : null,
      };
    });

  const humans: RevealPlayer[] = log.players
    .filter((p) => p.kind === "human")
    .map((player) => {
      const decisions = (decisionsByPlayer.get(player.id) ?? []).map((entry) => entry.decision);
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
      const base = { player, decisions, pokerFace, readsRight: right, readsTotal: graded.length, leaks, peakArousal: peak };
      return { ...base, achievements: achievements(base, tellMoments) };
    });

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
    aiTellChanged: aiDecisions.filter(tellChanged).length,
  };
}

const ACHIEVEMENT_CAP = 5;

/**
 * Badges a human earned this match, computed only from what the reveal already knows.
 * Pure. Fixed order, first five that apply. `moments` are the table's TellMoments (any player's);
 * only the ones that name this player count.
 */
export function achievements(player: Omit<RevealPlayer, "achievements">, moments: TellMoment[]): Achievement[] {
  const { pokerFace, readsTotal, decisions, leaks } = player;
  const bluffs = decisions.filter((d) => d.isBluff);
  const slipped = bluffs.filter((d) => d.tells && d.tells.bluffLikelihood < 0.5).length;
  const caught = bluffs.filter((d) => d.tells && d.tells.bluffLikelihood >= 0.7).length;
  const aggressive = decisions.filter((d) => d.aggressive).length;
  const topLeak = leaks[0]?.signal;
  const overruled = moments.some((m) => m.decision.mathAction !== m.decision.action && m.reads.some((r) => r.name === player.player.name));

  const rules: Array<[earned: boolean, badge: Achievement]> = [
    [pokerFace !== null && pokerFace >= 80 && readsTotal >= 3, { id: "stone_cold", title: "Stone Cold", blurb: "They graded your face on every bet and learned nothing.", tone: "gold" }],
    [pokerFace !== null && pokerFace <= 30, { id: "open_book", title: "Open Book", blurb: "Your cards were on your face the whole match.", tone: "danger" }],
    [slipped >= 2, { id: "bluff_artist", title: "Bluff Artist", blurb: "Two or more bluffs walked straight past the camera.", tone: "gold" }],
    [caught >= 1, { id: "caught_red_handed", title: "Caught Red-Handed", blurb: "You bluffed, and your face filed a report.", tone: "danger" }],
    [topLeak === "controls_glance", { id: "chip_glancer", title: "Chip Glancer", blurb: "Your eyes go to the bet controls when you like your hand. Caro called it in 1984.", tone: "ok" }],
    [topLeak === "freeze", { id: "frozen", title: "Frozen", blurb: "You go very still when it matters. They noticed.", tone: "muted" }],
    [topLeak === "fast_action", { id: "speed_demon", title: "Speed Demon", blurb: "You act fastest when you have the least. Slow down.", tone: "muted" }],
    [bluffs.length === 0 && aggressive >= 3, { id: "honest_to_a_fault", title: "Honest to a Fault", blurb: "You only bet when you had it. Admirable, and easy to play against.", tone: "ok" }],
    [overruled, { id: "they_were_listening", title: "They Were Listening", blurb: "An AI overruled its own math on the strength of your face.", tone: "danger" }],
    [decisions.length >= 10, { id: "marathon", title: "Marathon", blurb: "Ten or more decisions on the record.", tone: "muted" }],
  ];
  return rules.filter(([earned]) => earned).map(([, badge]) => badge).slice(0, ACHIEVEMENT_CAP);
}
