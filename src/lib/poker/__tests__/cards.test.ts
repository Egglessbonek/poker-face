import { describe, expect, it } from "vitest";
import { freshDeck, shuffle } from "../cards";
import { monteCarloEquity, describeHand } from "../equity";
import { newHand } from "../engine";

describe("cards", () => {
  it("builds a 52-card deck with no duplicates", () => {
    const d = freshDeck();
    expect(d).toHaveLength(52);
    expect(new Set(d).size).toBe(52);
  });
  it("shuffle preserves the multiset", () => {
    expect([...shuffle(freshDeck())].sort()).toEqual([...freshDeck()].sort());
  });
});

describe("equity", () => {
  it("AA beats a random hand most of the time", () => {
    const r = monteCarloEquity(["As", "Ah"], [], 1, 500);
    expect(r.equity).toBeGreaterThan(0.75);
  });
  it("equity drops against more opponents", () => {
    const one = monteCarloEquity(["Ks", "Kh"], [], 1, 600);
    const four = monteCarloEquity(["Ks", "Kh"], [], 4, 600);
    expect(four.equity).toBeLessThan(one.equity);
    expect(four.equity).toBeGreaterThan(0.3);
  });
  it("describes a flush", () => {
    expect(describeHand(["2s", "5s", "9s", "Ks", "Qs", "3d", "7c"]).name).toBe("Flush");
  });
});

describe("engine", () => {
  it("posts blinds and deals two cards each from one deck", () => {
    const h = newHand(1, [{ playerId: "a", stack: 200 }, null, { playerId: "b", stack: 200 }, { playerId: "c", stack: 200 }], 0, { smallBlind: 1, bigBlind: 2 });
    const dealt = h.seats.filter(Boolean);
    expect(dealt).toHaveLength(3);
    expect(dealt.every((s) => s!.holeCards.length === 2)).toBe(true);
    expect(h.pot).toBe(3);
    expect(h.deck).toHaveLength(46);
    const all = [...h.deck, ...dealt.flatMap((s) => s!.holeCards)];
    expect(new Set(all).size).toBe(52);
  });
});
