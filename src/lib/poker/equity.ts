/**
 * Monte Carlo equity via pokersolver 7-card evaluation.
 * Server-side only (pokersolver is CommonJS and slow-ish; ~2000 samples is a few ms).
 */

import { Hand } from "pokersolver";
import type { Card } from "@/lib/types";
import { freshDeck, shuffle } from "./cards";

export interface EquityResult {
  equity: number; // win + tie/2, 0-1
  win: number;
  tie: number;
  samples: number;
}

/** Villain's equity holding `hole` against a random hero hand on `board`. */
export function monteCarloEquity(hole: Card[], board: Card[], samples = 2000, rng?: () => number): EquityResult {
  const known = new Set<Card>([...hole, ...board]);
  const remaining = freshDeck().filter((c) => !known.has(c));
  let win = 0;
  let tie = 0;

  for (let i = 0; i < samples; i++) {
    const deck = shuffle(remaining, rng);
    const oppHole = [deck[0], deck[1]];
    const runout = deck.slice(2, 2 + (5 - board.length));
    const fullBoard = [...board, ...runout];
    const a = Hand.solve([...hole, ...fullBoard]);
    const b = Hand.solve([...oppHole, ...fullBoard]);
    const winners = Hand.winners([a, b]);
    if (winners.length === 2) tie++;
    else if (winners[0] === a) win++;
  }

  return { equity: (win + tie / 2) / samples, win: win / samples, tie: tie / samples, samples };
}

export function describeHand(cards: Card[]): { name: string; descr: string; rank: number } {
  const h = Hand.solve(cards);
  return { name: h.name, descr: h.descr, rank: h.rank };
}

export function potOdds(toCall: number, pot: number): number {
  if (toCall <= 0) return 0;
  return toCall / (pot + toCall);
}
