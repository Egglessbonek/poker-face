/**
 * Monte Carlo equity via pokersolver 7-card evaluation.
 * Server-side only (pokersolver is CommonJS and slow-ish; ~1500 samples vs 2 opponents is a few ms).
 */

import { Hand } from "pokersolver";
import type { Card } from "@/lib/types";
import { freshDeck, shuffle } from "./cards";
import { chenScore, topShare } from "./strategy";

export interface EquityResult {
  equity: number; // win + tie share, 0-1
  win: number;
  tie: number;
  samples: number;
  opponents: number;
}

export interface KnownEquityPlayer {
  id: string;
  hole: Card[];
  folded: boolean;
}

export interface KnownEquityResult {
  /** Share of winning runouts, including split-pot shares, from 0-1. */
  equity: number;
  /** Best made hand using the cards currently visible. */
  bestHand: string;
  samples: number;
}

/**
 * Equity holding `hole` on `board` against `opponents` hands. `ranges` (one entry per opponent, 0-1) restricts each
 * opponent to the top share of starting hands by Chen score, e.g. 0.2 for a preflop raiser, 1 for random; sampled
 * by rejection so it stays exact for any board.
 */
export function monteCarloEquity(hole: Card[], board: Card[], opponents = 1, samples = 1500, rng?: () => number, ranges?: number[]): EquityResult {
  const n = Math.max(1, opponents);
  const known = new Set<Card>([...hole, ...board]);
  const remaining = freshDeck().filter((c) => !known.has(c));
  const shareCache = new Map<number, number>();
  const inRange = (a: Card, b: Card, pct: number) => {
    if (pct >= 1) return true;
    const s = chenScore([a, b]);
    let sh = shareCache.get(s);
    if (sh === undefined) { sh = topShare(s); shareCache.set(s, sh); }
    return sh <= pct;
  };
  let win = 0;
  let tie = 0;
  let tieShare = 0;

  const rand = rng ?? Math.random;
  for (let i = 0; i < samples; i++) {
    // Pool of undealt cards for this sample; opponents draw pairs by index so a rejected pair goes back to the pool.
    const pool = [...remaining];
    const dealt: Card[] = [];
    for (let k = 0; k < n; k++) {
      const pct = ranges?.[k] ?? 1;
      let a = 0, b = 1;
      for (let tries = 0; tries < 24; tries++) {
        a = Math.floor(rand() * pool.length);
        b = Math.floor(rand() * (pool.length - 1));
        if (b >= a) b++;
        if (inRange(pool[a], pool[b], pct)) break;
      }
      const [hi, lo] = a > b ? [a, b] : [b, a];
      dealt.push(pool[a], pool[b]);
      pool.splice(hi, 1);
      pool.splice(lo, 1);
    }
    const runout = shuffle(pool, rng).slice(0, 5 - board.length);
    const fullBoard = [...board, ...runout];
    const mine = Hand.solve([...hole, ...fullBoard]);
    const hands = [mine];
    for (let k = 0; k < n; k++) hands.push(Hand.solve([dealt[2 * k], dealt[2 * k + 1], ...fullBoard]));
    const winners = Hand.winners(hands);
    if (!winners.includes(mine)) continue;
    if (winners.length === 1) win++;
    else {
      tie++;
      tieShare += 1 / winners.length;
    }
  }

  return { equity: (win + tieShare) / samples, win: win / samples, tie: tie / samples, samples, opponents: n };
}

export function describeHand(cards: Card[]): { name: string; descr: string; rank: number } {
  const h = Hand.solve(cards);
  return { name: h.name, descr: h.descr, rank: h.rank };
}

function combinationCount(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= Math.min(k, n - k); i++) result = (result * (n - i + 1)) / i;
  return result;
}

function* combinations(cards: Card[], count: number, start = 0, prefix: Card[] = []): Generator<Card[]> {
  if (prefix.length === count) {
    yield prefix;
    return;
  }
  const stillNeeded = count - prefix.length;
  for (let i = start; i <= cards.length - stillNeeded; i++) {
    yield* combinations(cards, count, i + 1, [...prefix, cards[i]]);
  }
}

/** Stable pseudo-random runouts keep the broadcast percentage from flickering between identical requests. */
function seededRandom(input: string): () => number {
  let seed = 2166136261;
  for (let i = 0; i < input.length; i++) {
    seed ^= input.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  return () => {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Broadcast equity when every dealt hand is known. Post-flop runouts are enumerated exactly when practical;
 * larger spaces use deterministic Monte Carlo. Folded players keep a hand description but have zero equity.
 */
export function knownTableEquities(players: KnownEquityPlayer[], board: Card[], maxSamples = 1500): Record<string, KnownEquityResult> {
  if (board.length > 5) throw new Error("A hold'em board cannot contain more than five cards");
  if (players.some((player) => player.hole.length !== 2)) throw new Error("Every dealt player must have two hole cards");

  const knownCards = [...board, ...players.flatMap((player) => player.hole)];
  const deck = new Set<Card>(freshDeck());
  if (knownCards.some((card) => !deck.has(card)) || new Set(knownCards).size !== knownCards.length) {
    throw new Error("Known cards must be valid and unique");
  }

  const active = players.filter((player) => !player.folded);
  const results = Object.fromEntries(players.map((player) => [player.id, {
    equity: 0,
    bestHand: describeHand([...player.hole, ...board]).descr,
    samples: 0,
  }])) as Record<string, KnownEquityResult>;
  if (active.length === 0) return results;
  if (active.length === 1) {
    results[active[0].id] = { ...results[active[0].id], equity: 1, samples: 1 };
    return results;
  }

  const knownSet = new Set(knownCards);
  const remaining = freshDeck().filter((card) => !knownSet.has(card));
  const needed = 5 - board.length;
  const possibleRunouts = combinationCount(remaining.length, needed);
  const sampleLimit = Math.max(1, Math.floor(maxSamples));
  const exact = possibleRunouts <= sampleLimit;
  const rng = seededRandom(knownCards.join("|") + active.map((player) => player.id).join("|"));
  const runouts: Iterable<Card[]> = exact
    ? combinations(remaining, needed)
    : Array.from({ length: sampleLimit }, () => shuffle(remaining, rng).slice(0, needed));

  let samples = 0;
  for (const runout of runouts) {
    const fullBoard = [...board, ...runout];
    const hands = active.map((player) => Hand.solve([...player.hole, ...fullBoard]));
    const winners = Hand.winners(hands);
    const share = 1 / winners.length;
    for (let i = 0; i < active.length; i++) {
      if (winners.includes(hands[i])) results[active[i].id].equity += share;
    }
    samples++;
  }

  for (const player of players) {
    results[player.id].samples = samples;
    results[player.id].equity = player.folded || samples === 0 ? 0 : results[player.id].equity / samples;
  }
  return results;
}

export function potOdds(toCall: number, pot: number): number {
  if (toCall <= 0) return 0;
  return toCall / (pot + toCall);
}
