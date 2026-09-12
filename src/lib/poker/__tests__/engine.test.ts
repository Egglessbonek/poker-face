import { describe, expect, it } from "vitest";
import { applyAction, bounds, legalActions, newHand } from "../engine";
import { DEFAULT_MATCH, type HandState } from "@/lib/types";

const cfg = DEFAULT_MATCH;
const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

function start(heroStack = 200, villainStack = 200, button: "hero" | "villain" = "hero"): HandState {
  return newHand(1, { hero: heroStack, villain: villainStack }, button, cfg, seeded(42));
}

describe("engine: blinds and preflop order", () => {
  it("button posts SB and acts first preflop", () => {
    const h = start();
    expect(h.players.hero.committed).toBe(1);
    expect(h.players.villain.committed).toBe(2);
    expect(h.pot).toBe(3);
    expect(h.toAct).toBe("hero");
    expect(legalActions(h, "hero", cfg)).toEqual(["fold", "call", "raise", "allin"]);
    expect(bounds(h, "hero", cfg)).toEqual({ toCall: 1, minTotal: 4, maxTotal: 200 });
  });

  it("BB has the option after SB limps", () => {
    let h = start();
    h = applyAction(h, { seat: "hero", type: "call" }, cfg);
    expect(h.street).toBe("preflop");
    expect(h.toAct).toBe("villain");
    expect(legalActions(h, "villain", cfg)).toEqual(["check", "bet", "allin"]);
    h = applyAction(h, { seat: "villain", type: "check" }, cfg);
    expect(h.street).toBe("flop");
    expect(h.board).toHaveLength(3);
    expect(h.toAct).toBe("villain"); // BB acts first postflop
    expect(h.currentBet).toBe(0);
  });
});

describe("engine: betting", () => {
  it("raise sets min raise and reopens action", () => {
    let h = start();
    h = applyAction(h, { seat: "hero", type: "raise", amount: 6 }, cfg);
    expect(h.currentBet).toBe(6);
    expect(h.minRaise).toBe(4);
    expect(h.pot).toBe(8);
    expect(bounds(h, "villain", cfg)).toEqual({ toCall: 4, minTotal: 10, maxTotal: 200 });
    h = applyAction(h, { seat: "villain", type: "raise", amount: 20 }, cfg);
    expect(h.toAct).toBe("hero");
    h = applyAction(h, { seat: "hero", type: "call" }, cfg);
    expect(h.street).toBe("flop");
    expect(h.pot).toBe(40);
  });

  it("rejects illegal actions and out-of-range amounts", () => {
    const h = start();
    expect(() => applyAction(h, { seat: "villain", type: "call" }, cfg)).toThrow();
    expect(() => applyAction(h, { seat: "hero", type: "check" }, cfg)).toThrow();
    expect(() => applyAction(h, { seat: "hero", type: "raise", amount: 3 }, cfg)).toThrow();
    expect(() => applyAction(h, { seat: "hero", type: "raise", amount: 500 }, cfg)).toThrow();
  });

  it("fold awards the pot and refunds nothing extra", () => {
    let h = start();
    h = applyAction(h, { seat: "hero", type: "raise", amount: 10 }, cfg);
    h = applyAction(h, { seat: "villain", type: "fold" }, cfg);
    expect(h.over).toBe(true);
    expect(h.winner).toBe("hero");
    expect(h.players.hero.stack).toBe(202);
    expect(h.players.villain.stack).toBe(198);
  });
});

describe("engine: all-in and showdown", () => {
  it("all-in call runs out the board and awards the pot", () => {
    let h = start();
    h = applyAction(h, { seat: "hero", type: "allin" }, cfg);
    expect(h.currentBet).toBe(200);
    expect(legalActions(h, "villain", cfg)).toEqual(["fold", "call", "allin"]);
    h = applyAction(h, { seat: "villain", type: "call" }, cfg);
    expect(h.over).toBe(true);
    expect(h.board).toHaveLength(5);
    expect(h.street).toBe("showdown");
    expect(h.players.hero.stack + h.players.villain.stack).toBe(400);
    expect(h.showdown?.hero).toBeTruthy();
  });

  it("refunds uncalled excess when the short stack is all-in", () => {
    let h = start(200, 50);
    h = applyAction(h, { seat: "hero", type: "allin" }, cfg);
    h = applyAction(h, { seat: "villain", type: "call" }, cfg);
    expect(h.over).toBe(true);
    expect(h.players.hero.stack + h.players.villain.stack).toBe(250);
    // Loser can only lose 50; winner nets at most +50.
    const heroNet = h.players.hero.stack - 200;
    expect(Math.abs(heroNet)).toBeLessThanOrEqual(50);
  });

  it("short stack all-in for less than the current bet is treated as a call", () => {
    let h = start(200, 3, "villain"); // villain on button posts SB 1 with 3 chips, hero posts BB 2
    h = applyAction(h, { seat: "villain", type: "raise", amount: 3 }, cfg); // raise all-in to 3 (min-raise not met but it's all-in)
    expect(h.players.villain.allIn).toBe(true);
    expect(legalActions(h, "hero", cfg)).toEqual(["fold", "call", "allin"]);
    h = applyAction(h, { seat: "hero", type: "call" }, cfg);
    expect(h.over).toBe(true);
    expect(h.players.hero.stack + h.players.villain.stack).toBe(203);
  });
});
