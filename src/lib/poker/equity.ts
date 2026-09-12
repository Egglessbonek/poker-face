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

export function potOdds(toCall: number, pot: number): number {
  if (toCall <= 0) return 0;
  return toCall / (pot + toCall);
}
