import { describe, expect, it } from "vitest";
import { freshDeck, shuffle } from "../cards";
import { monteCarloEquity, describeHand, knownTableEquities } from "../equity";
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
  it("survives many tight-range opponents without running out of cards", () => {
    const r = monteCarloEquity(["As", "Kh"], ["2c", "7d", "9s"], 5, 300, undefined, [0.05, 0.05, 0.05, 0.1, 0.1]);
    expect(r.samples).toBe(300);
    expect(r.equity).toBeGreaterThan(0);
    expect(r.equity).toBeLessThan(1);
  });
  it("tighter opponent ranges lower a marginal hand's equity", () => {
    const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const vsRandom = monteCarloEquity(["Jh", "Td"], [], 1, 1500, seeded(7), [1]).equity;
    const vsTight = monteCarloEquity(["Jh", "Td"], [], 1, 1500, seeded(7), [0.1]).equity;
    expect(vsTight).toBeLessThan(vsRandom);
  });
  it("describes a flush", () => {
    expect(describeHand(["2s", "5s", "9s", "Ks", "Qs", "3d", "7c"]).name).toBe("Flush");
  });
  it("calculates exact river equity against the other visible hands", () => {
    const result = knownTableEquities([
      { id: "nuts", hole: ["As", "Ah"], folded: false },
      { id: "pair", hole: ["Ks", "Kh"], folded: false },
      { id: "folded", hole: ["Qs", "Qh"], folded: true },
    ], ["2c", "3d", "4h", "8s", "9c"]);

    expect(result.nuts.equity).toBe(1);
    expect(result.pair.equity).toBe(0);
    expect(result.folded.equity).toBe(0);
    expect(result.nuts.bestHand).toBe("Pair, A's");
    expect(result.nuts.samples).toBe(1);
  });
  it("splits equity evenly when the board plays", () => {
    const result = knownTableEquities([
      { id: "one", hole: ["2c", "3d"], folded: false },
      { id: "two", hole: ["4c", "5d"], folded: false },
    ], ["As", "Ks", "Qs", "Js", "Ts"]);

    expect(result.one.equity).toBe(0.5);
    expect(result.two.equity).toBe(0.5);
    expect(result.one.bestHand).toBe("Royal Flush");
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
