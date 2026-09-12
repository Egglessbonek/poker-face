/**
 * The AI seats' math baseline: a real (if compact) No-Limit Hold'em strategy, not "equity vs pot odds".
 * Pure functions so the same logic is unit-testable and explainable to the LLM ("the math says X because Y").
 *
 * Preflop: Chen-formula hand strength by position, open/3-bet/4-bet thresholds, sizing in big blinds.
 * Postflop: made-hand category (top pair, overpair, two pair...) and draws (outs), stack-to-pot ratio,
 * initiative (c-bet), value sizing by street, semi-bluffs, a bounded bluff frequency, pot-odds discipline.
 */

import { Hand } from "pokersolver";
import type { ActionType, Card, Rank, Street } from "@/lib/types";
import { RANKS, rankOf, suitOf } from "./cards";

// ---------- preflop hand strength (Chen formula) ----------

const HIGH: Partial<Record<Rank, number>> = { A: 10, K: 8, Q: 7, J: 6 };

export function chenScore(hole: Card[]): number {
  const [a, b] = hole;
  const ra = RANKS.indexOf(rankOf(a));
  const rb = RANKS.indexOf(rankOf(b));
  const hi = ra >= rb ? a : b;
  const hiRank = rankOf(hi);
  let score = HIGH[hiRank] ?? (RANKS.indexOf(hiRank) + 2) / 2;
  if (rankOf(a) === rankOf(b)) return Math.max(5, score * 2);
  if (suitOf(a) === suitOf(b)) score += 2;
  const gap = Math.abs(ra - rb) - 1;
  if (gap === 1) score -= 1;
  else if (gap === 2) score -= 2;
  else if (gap === 3) score -= 4;
  else if (gap >= 4) score -= 5;
  if (gap <= 1 && RANKS.indexOf(hiRank) < RANKS.indexOf("Q")) score += 1;
  return Math.ceil(score);
}

/** Share of all starting hands (weighted by combos) whose Chen score is >= `score`: 0.02 for aces, ~1 for junk. */
export function topShare(score: number): number {
  let above = 0;
  let total = 0;
  for (let i = 0; i < RANKS.length; i++) {
    for (let j = i; j < RANKS.length; j++) {
      if (i === j) {
        const s = chenScore([`${RANKS[i]}s`, `${RANKS[i]}h`] as Card[]);
        total += 6;
        if (s >= score) above += 6;
      } else {
        const suited = chenScore([`${RANKS[i]}s`, `${RANKS[j]}s`] as Card[]);
        const off = chenScore([`${RANKS[i]}s`, `${RANKS[j]}h`] as Card[]);
        total += 16;
        if (suited >= score) above += 4;
        if (off >= score) above += 12;
      }
    }
  }
  return above / total;
}

// ---------- postflop hand reading ----------

export interface HandRead {
  /** pokersolver name: "Pair", "Two Pair", ... */
  name: string;
  descr: string;
  /** Finer category for pairs: overpair, top pair, middle pair, bottom pair, pocket pair under. */
  category: string;
  /** Rough made-hand strength 0-1, before equity. */
  strength: number;
  draws: string[];
  outs: number;
}

const RANK_VALUE = (c: Card) => RANKS.indexOf(rankOf(c));

export function readHand(hole: Card[], board: Card[]): HandRead {
  const solved = Hand.solve([...hole, ...board]);
  const name: string = solved.name;
  const descr: string = solved.descr;
  const boardVals = board.map(RANK_VALUE).sort((a, b) => b - a);
  const holeVals = hole.map(RANK_VALUE).sort((a, b) => b - a);
  const top = boardVals[0] ?? -1;
  let category = name;
  let strength = 0.1;

  if (name === "Pair") {
    const pocket = holeVals[0] === holeVals[1];
    if (pocket) {
      if (holeVals[0] > top) { category = "overpair"; strength = 0.66; }
      else if (holeVals[0] > (boardVals[1] ?? -1)) { category = "pocket pair below the top card"; strength = 0.42; }
      else { category = "small pocket pair"; strength = 0.3; }
    } else {
      const pairedHole = holeVals.find((v) => boardVals.includes(v));
      const kicker = holeVals.find((v) => v !== pairedHole) ?? 0;
      if (pairedHole === top) { category = kicker >= RANKS.indexOf("Q") ? "top pair, good kicker" : "top pair, weak kicker"; strength = kicker >= RANKS.indexOf("Q") ? 0.6 : 0.5; }
      else if (pairedHole === boardVals[1]) { category = "middle pair"; strength = 0.38; }
      else if (pairedHole !== undefined) { category = "bottom pair"; strength = 0.3; }
      else { category = "board pair only"; strength = 0.15; }
    }
  } else if (name === "High Card") {
    const overs = holeVals.filter((v) => v > top).length;
    category = overs === 2 ? "two overcards" : overs === 1 ? "one overcard" : "nothing";
    strength = overs === 2 ? 0.2 : overs === 1 ? 0.14 : 0.08;
  } else if (name === "Two Pair") { strength = holeVals[0] === holeVals[1] || holeVals.every((v) => boardVals.includes(v)) ? 0.72 : 0.78; category = "two pair"; }
  else if (name === "Three of a Kind") { category = holeVals[0] === holeVals[1] ? "set" : "trips"; strength = holeVals[0] === holeVals[1] ? 0.88 : 0.82; }
  else if (name === "Straight") strength = 0.9;
  else if (name === "Flush") strength = 0.93;
  else strength = 0.97; // full house and up

  // Draws only matter before the river.
  const draws: string[] = [];
  let outs = 0;
  if (board.length < 5) {
    const all = [...hole, ...board];
    const suits = new Map<string, number>();
    for (const c of all) suits.set(suitOf(c), (suits.get(suitOf(c)) ?? 0) + 1);
    const holeSuits = new Set<string>(hole.map(suitOf));
    for (const [s, n] of suits) if (n === 4 && holeSuits.has(s) && name !== "Flush") { draws.push("flush draw"); outs += 9; }
    const vals = [...new Set(all.map(RANK_VALUE))].sort((a, b) => a - b);
    const withWheel = vals.includes(12) ? [-1, ...vals] : vals;
    let best = 0;
    for (let lo = -1; lo <= 8; lo++) {
      const have = [lo, lo + 1, lo + 2, lo + 3, lo + 4].filter((v) => withWheel.includes(v)).length;
      best = Math.max(best, have);
    }
    if (name !== "Straight" && best === 4) {
      // Open-ended if a 4-run exists, gutshot otherwise.
      const run = withWheel.some((v, i) => i >= 3 && withWheel[i - 1] === v - 1 && withWheel[i - 2] === v - 2 && withWheel[i - 3] === v - 3);
      if (run) { draws.push("open-ended straight draw"); outs += 8; } else { draws.push("gutshot"); outs += 4; }
    }
    if (category === "two overcards") outs += 6;
    if (draws.length > 1) outs -= 2; // shared outs
  }
  return { name, descr, category, strength: Math.min(1, strength), draws, outs };
}

// ---------- decision ----------

export interface StrategyInput {
  street: Street;
  hole: Card[];
  board: Card[];
  /** Equity (0-1) vs the opponents still in, already including any tell adjustment. */
  equity: number;
  potOdds: number;
  pot: number;
  toCall: number;
  currentBet: number;
  stack: number;
  committed: number;
  position: string;
  /** Opponents still in the hand. */
  live: number;
  legal: ActionType[];
  minTotal: number;
  maxTotal: number;
  bigBlind: number;
  /** Did this seat make the last bet or raise of the previous street (initiative)? */
  hasInitiative: boolean;
  /** How many raises have happened this street before us. */
  raisesThisStreet: number;
  /** 0-1, deterministic per decision; drives mixed strategies (c-bets, bluffs). */
  roll: number;
}

export interface Recommendation {
  action: ActionType;
  /** Total committed after the action, for bet/raise. */
  amount?: number;
  reason: string;
  read: HandRead;
}

const LATE = new Set(["BTN", "CO", "BTN/SB"]);
const EARLY = new Set(["UTG", "UTG+1", "UTG+2"]);

export function recommend(input: StrategyInput): Recommendation {
  const { street, hole, board, legal, bigBlind } = input;
  const has = (a: ActionType) => legal.includes(a);
  const read = readHand(hole, board);
  const size = (frac: number) => Math.round(input.currentBet + Math.max(bigBlind, (input.pot + input.toCall) * frac));
  const clamp = (total: number) => Math.max(input.minTotal, Math.min(input.maxTotal, total));
  const spr = input.pot > 0 ? (input.stack + input.committed) / input.pot : 99;
  const out = (action: ActionType, reason: string, amount?: number): Recommendation => ({ action, amount: amount === undefined ? undefined : clamp(amount), reason, read });
  const bet = (frac: number, reason: string) => (has("bet") ? out("bet", reason, size(frac)) : has("raise") ? out("raise", reason, size(frac)) : has("allin") ? out("allin", reason) : out("check", reason));
  const raise = (frac: number, reason: string) => (has("raise") ? out("raise", reason, size(frac)) : has("allin") ? out("allin", reason) : has("call") ? out("call", reason) : out("check", reason));
  const passive = (reason: string) => (has("check") ? out("check", reason) : has("call") ? out("call", reason) : out("fold", reason));

  if (street === "preflop") {
    const score = chenScore(hole);
    const late = LATE.has(input.position);
    const early = EARLY.has(input.position);
    const openAt = late ? 6 : early ? 8 : 7;
    const facingRaise = input.toCall > bigBlind || input.raisesThisStreet > 0;
    const shortStack = (input.stack + input.committed) / bigBlind < 15;

    if (!facingRaise) {
      if (score >= openAt) {
        const limpers = Math.max(0, Math.round((input.pot - 1.5 * bigBlind) / bigBlind));
        return bet(0, `Chen ${score} from ${input.position} opens; ${limpers} limper(s)`).action === "check"
          ? out("check", "option")
          : out(has("raise") ? "raise" : has("bet") ? "bet" : "allin", `Chen ${score} from ${input.position}: open`, Math.round((2.5 + 0.5 * limpers) * bigBlind + input.currentBet));
      }
      return has("check") ? out("check", `Chen ${score}: take the free look`) : out("fold", `Chen ${score} from ${input.position} is not an open`);
    }
    // Facing a raise (or more).
    const threeBetAt = input.raisesThisStreet >= 2 ? 14 : 11;
    if (score >= threeBetAt) {
      if (shortStack && has("allin")) return out("allin", `Chen ${score} with ${Math.round((input.stack + input.committed) / bigBlind)}bb: jam`);
      return raise(1.0, `Chen ${score}: re-raise`);
    }
    const callAt = input.raisesThisStreet >= 2 ? 11 : late ? 7 : 8;
    if (score >= callAt && has("call") && input.potOdds <= 0.4) return out("call", `Chen ${score}: call and see a flop`);
    return has("fold") ? out("fold", `Chen ${score} cannot continue vs a raise`) : out("check", "free");
  }

  // ---------- postflop ----------
  const eq = input.equity;
  const facingBet = input.toCall > 0;
  const strong = read.strength >= 0.6; // top pair good kicker or better
  const monster = read.strength >= 0.78;
  const drawing = read.outs >= 8; // flush draw / OESD
  const valueFrac = street === "flop" ? 0.6 : street === "turn" ? 0.7 : 0.8;

  if (!facingBet) {
    if (monster) {
      if (spr < 2 && has("allin")) return out("allin", `${read.category}, SPR ${spr.toFixed(1)}: get it in`);
      // Occasionally trap in position with a monster.
      if (input.roll < 0.2 && LATE.has(input.position) && street !== "river") return passive(`${read.category}: slow-play this street`);
      return bet(valueFrac, `${read.category}: value bet`);
    }
    if (strong) return bet(street === "river" ? 0.6 : 0.5, `${read.category}: value bet`);
    if (drawing && street !== "river") return input.roll < 0.65 ? bet(0.6, `${read.draws.join(", ")} (${read.outs} outs): semi-bluff`) : passive(`${read.draws.join(", ")}: take a free card`);
    if (read.strength >= 0.35) return input.hasInitiative && input.roll < 0.4 && street === "flop" ? bet(0.33, `${read.category}: small continuation bet`) : passive(`${read.category}: check, control the pot`);
    // Air: c-bet with initiative on the flop, bluff the river sometimes when checked to, otherwise check.
    if (input.hasInitiative && street === "flop" && input.roll < 0.55 && input.live === 1) return bet(0.5, "no pair but the initiative: continuation bet");
    if (street === "river" && input.roll < 0.25 && input.live === 1 && eq < 0.2) return bet(0.7, "no showdown value: bluff the river");
    return passive(`${read.category}: check`);
  }

  // Facing a bet.
  if (monster) {
    if (spr < 3 && has("allin")) return out("allin", `${read.category}: stacks are shallow, jam`);
    return input.roll < 0.75 ? raise(1.0, `${read.category}: raise for value`) : out("call", `${read.category}: call to keep them in`);
  }
  if (strong) return eq >= 0.68 && has("raise") && input.roll < 0.4 ? raise(0.9, `${read.category}: raise`) : has("call") ? out("call", `${read.category}: call`) : passive("call");
  if (drawing && street !== "river") {
    const implied = street === "flop" ? 0.08 : 0.03;
    if (eq + implied >= input.potOdds && has("call")) return out("call", `${read.draws.join(", ")} (${read.outs} outs) vs ${(input.potOdds * 100).toFixed(0)}% pot odds: call`);
    if (input.raisesThisStreet === 0 && has("raise") && input.roll < 0.3) return raise(0.9, `${read.draws.join(", ")}: semi-bluff raise`);
    return out("fold", `${read.draws.join(", ")} but the price is wrong`);
  }
  if (eq > input.potOdds + 0.05 && has("call")) return out("call", `${read.category}: ${(eq * 100).toFixed(0)}% equity beats ${(input.potOdds * 100).toFixed(0)}% pot odds`);
  return has("fold") ? out("fold", `${read.category}: ${(eq * 100).toFixed(0)}% equity does not cover ${(input.potOdds * 100).toFixed(0)}% pot odds`) : out("check", "free");
}

/** Deterministic 0-1 from a decision's identity, so mixed strategies are reproducible per spot. */
export function decisionRoll(handNumber: number, street: Street, hole: Card[]): number {
  let h = 2166136261;
  for (const ch of `${handNumber}|${street}|${hole.join("")}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h % 10000) / 10000;
}
