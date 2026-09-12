import type { Card, Rank, Suit } from "@/lib/types";

export const RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
export const SUITS: Suit[] = ["s", "h", "d", "c"];

export function freshDeck(): Card[] {
  const deck: Card[] = [];
  for (const r of RANKS) for (const s of SUITS) deck.push(`${r}${s}`);
  return deck;
}

/** Fisher-Yates shuffle. Pass `rng` for deterministic tests. */
export function shuffle(deck: Card[], rng: () => number = Math.random): Card[] {
  const out = [...deck];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function rankOf(card: Card): Rank {
  return card[0] as Rank;
}

export function suitOf(card: Card): Suit {
  return card[1] as Suit;
}

export const SUIT_SYMBOL: Record<Suit, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };

export function prettyCard(card: Card): string {
  return `${rankOf(card) === "T" ? "10" : rankOf(card)}${SUIT_SYMBOL[suitOf(card)]}`;
}
