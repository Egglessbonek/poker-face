/**
 * Server-owned match state. The client never sees the villain's hole cards until a hand is over
 * and never sees the deck. Villain turns run here, so a hero action may return several villain
 * decisions (e.g. villain raises, then after hero calls, villain acts first on the flop).
 */

import "server-only";
import type { ActionRequest } from "@/lib/poker/engine";
import { applyAction, bounds, legalActions, newHand, otherSeat, publicHand } from "@/lib/poker/engine";
import { monteCarloEquity, potOdds } from "@/lib/poker/equity";
import { decide } from "@/lib/villain/brain";
import { appendLog, getSession } from "@/lib/store";
import { publish } from "@/lib/rail/bus";
import { DEFAULT_MATCH, type MatchConfig, type MatchState, type PublicMatchState, type TellVector, type VillainDecision } from "@/lib/types";

const g = globalThis as unknown as { __matches?: Map<string, MatchState> };
const matches = (g.__matches ??= new Map<string, MatchState>());

export interface StepResult {
  state: PublicMatchState;
  villainDecisions: VillainDecision[];
}

export function getMatch(sessionId: string): MatchState | undefined {
  return matches.get(sessionId);
}

export async function startMatch(sessionId: string, config: MatchConfig = DEFAULT_MATCH): Promise<StepResult> {
  const match: MatchState = {
    config,
    handNumber: 0,
    stacks: { hero: config.startingStack, villain: config.startingStack },
    button: "hero",
    hand: null,
    over: false,
    results: [],
  };
  matches.set(sessionId, match);
  return dealNext(sessionId, match);
}

export async function nextHand(sessionId: string): Promise<StepResult> {
  const match = must(sessionId);
  if (match.hand && !match.hand.over) throw new Error("Hand still in progress");
  if (match.over) return { state: toPublic(match), villainDecisions: [] };
  return dealNext(sessionId, match);
}

export async function heroAct(sessionId: string, req: Omit<ActionRequest, "seat">, tells: TellVector | null): Promise<StepResult> {
  const match = must(sessionId);
  if (!match.hand || match.hand.over) throw new Error("No hand in progress");
  match.hand = applyAction(match.hand, { ...req, seat: "hero" }, match.config);
  const action = match.hand.actions[match.hand.actions.length - 1];
  appendLog(sessionId, { kind: "hero_action", data: { action, tells } });
  if (tells) appendLog(sessionId, { kind: "tells", data: { handNumber: match.hand.handNumber, street: action.street, tells } });
  railHand(sessionId, match);
  publish(railCode(sessionId), { type: "hero_action", action });

  const decisions = await runVillain(sessionId, match, tells);
  finishHandIfOver(sessionId, match);
  return { state: toPublic(match), villainDecisions: decisions };
}

// ---------- internals ----------

function must(sessionId: string): MatchState {
  const m = matches.get(sessionId);
  if (!m) throw new Error("No match for session");
  return m;
}

function railCode(sessionId: string): string {
  return getSession(sessionId)?.railCode ?? "";
}

function railHand(sessionId: string, match: MatchState) {
  if (match.hand) publish(railCode(sessionId), { type: "hand", hand: publicHand(match.hand) }); // rail sees everything
}

async function dealNext(sessionId: string, match: MatchState): Promise<StepResult> {
  match.handNumber += 1;
  match.button = match.handNumber === 1 ? "hero" : otherSeat(match.button);
  match.hand = newHand(match.handNumber, match.stacks, match.button, match.config);
  appendLog(sessionId, { kind: "hand_start", data: { handNumber: match.handNumber, button: match.button, stacks: { ...match.stacks }, hero: match.hand.players.hero.holeCards, villain: match.hand.players.villain.holeCards } });
  railHand(sessionId, match);
  const decisions = await runVillain(sessionId, match, null);
  finishHandIfOver(sessionId, match);
  return { state: toPublic(match), villainDecisions: decisions };
}

async function runVillain(sessionId: string, match: MatchState, tells: TellVector | null): Promise<VillainDecision[]> {
  const decisions: VillainDecision[] = [];
  const session = getSession(sessionId);
  let guard = 0;
  while (match.hand && !match.hand.over && match.hand.toAct === "villain" && guard++ < 8) {
    const hand = match.hand;
    const v = hand.players.villain;
    const h = hand.players.hero;
    const legal = legalActions(hand, "villain", match.config);
    const b = bounds(hand, "villain", match.config);
    const eq = monteCarloEquity(v.holeCards, hand.board, 1500);
    const decision = await decide({
      hand: { handNumber: hand.handNumber, street: hand.street, board: hand.board, pot: hand.pot, currentBet: hand.currentBet, minRaise: hand.minRaise, actions: hand.actions },
      villain: { holeCards: v.holeCards, stack: v.stack, committed: v.committed },
      hero: { stack: h.stack, committed: h.committed },
      legalActions: legal,
      bounds: b,
      equity: eq.equity,
      potOdds: potOdds(b.toCall, hand.pot),
      tells,
      personaId: session?.personaId ?? "vega",
    });
    try {
      match.hand = applyAction(hand, { seat: "villain", type: decision.action, amount: decision.amount }, match.config);
    } catch (err) {
      console.error("villain produced illegal action, falling back", err);
      const fallback = legal.includes("check") ? "check" : legal.includes("call") ? "call" : "fold";
      match.hand = applyAction(hand, { seat: "villain", type: fallback }, match.config);
      decision.action = fallback;
      decision.amount = undefined;
    }
    decisions.push(decision);
    appendLog(sessionId, { kind: "villain_decision", data: { handNumber: hand.handNumber, street: hand.street, equity: eq.equity, decision } });
    publish(railCode(sessionId), { type: "villain", decision });
    railHand(sessionId, match);
  }
  return decisions;
}

function finishHandIfOver(sessionId: string, match: MatchState) {
  const hand = match.hand;
  if (!hand || !hand.over) return;
  match.stacks = { hero: hand.players.hero.stack, villain: hand.players.villain.stack };
  match.results.push({ handNumber: hand.handNumber, winner: hand.winner ?? "split", pot: hand.pot, heroCards: hand.players.hero.holeCards, villainCards: hand.players.villain.holeCards, board: hand.board });
  appendLog(sessionId, { kind: "hand_end", data: { handNumber: hand.handNumber, winner: hand.winner, pot: hand.pot, stacks: { ...match.stacks }, showdown: hand.showdown } });
  if (match.handNumber >= match.config.handsPerMatch || match.stacks.hero === 0 || match.stacks.villain === 0) match.over = true;
  railHand(sessionId, match);
}

export function toPublic(match: MatchState): PublicMatchState {
  const hand = match.hand;
  return {
    config: match.config,
    handNumber: match.handNumber,
    stacks: match.stacks,
    button: match.button,
    hand: hand ? publicHand(hand, "villain") : null,
    over: match.over,
    results: match.results,
    legalActions: hand ? legalActions(hand, "hero", match.config) : [],
    bounds: hand && !hand.over && hand.toAct === "hero" ? bounds(hand, "hero", match.config) : null,
  };
}
