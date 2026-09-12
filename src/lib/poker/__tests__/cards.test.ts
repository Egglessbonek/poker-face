import { describe, expect, it } from "vitest";
import { freshDeck, shuffle } from "../cards";
import { monteCarloEquity, describeHand } from "../equity";
import { newHand } from "../engine";
import { DEFAULT_MATCH } from "@/lib/types";

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
    const r = monteCarloEquity(["As", "Ah"], [], 500);
    expect(r.equity).toBeGreaterThan(0.75);
  });
  it("describes a flush", () => {
    expect(describeHand(["2s", "5s", "9s", "Ks", "Qs", "3d", "7c"]).name).toBe("Flush");
  });
});

describe("engine", () => {
  it("posts blinds and deals two cards each", () => {
    const h = newHand(1, { hero: 200, villain: 200 }, "hero", DEFAULT_MATCH);
    expect(h.players.hero.holeCards).toHaveLength(2);
    expect(h.players.villain.holeCards).toHaveLength(2);
    expect(h.pot).toBe(3);
    expect(h.toAct).toBe("hero");
    expect(h.deck).toHaveLength(48);
  });
});
