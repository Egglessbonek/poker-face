/**
 * Monte Carlo equity via pokersolver 7-card evaluation.
 * Server-side only (pokersolver is CommonJS and slow-ish; ~1500 samples vs 2 opponents is a few ms).
 */

import { Hand } from "pokersolver";
import type { Card } from "@/lib/types";
import { freshDeck, shuffle } from "./cards";

export interface EquityResult {
  equity: number; // win + tie share, 0-1
  win: number;
  tie: number;
  samples: number;
  opponents: number;
}

/** Equity holding `hole` on `board` against `opponents` random hands. */
export function monteCarloEquity(hole: Card[], board: Card[], opponents = 1, samples = 1500, rng?: () => number): EquityResult {
  const n = Math.max(1, opponents);
  const known = new Set<Card>([...hole, ...board]);
  const remaining = freshDeck().filter((c) => !known.has(c));
  let win = 0;
  let tie = 0;
  let tieShare = 0;

  for (let i = 0; i < samples; i++) {
    const deck = shuffle(remaining, rng);
    const runout = deck.slice(n * 2, n * 2 + (5 - board.length));
    const fullBoard = [...board, ...runout];
    const mine = Hand.solve([...hole, ...fullBoard]);
    const hands = [mine];
    for (let k = 0; k < n; k++) hands.push(Hand.solve([deck[2 * k], deck[2 * k + 1], ...fullBoard]));
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
