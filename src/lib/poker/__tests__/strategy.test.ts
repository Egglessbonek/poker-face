import { describe, expect, it } from "vitest";
import { chenScore, decisionRoll, readHand, recommend, topShare, type StrategyInput } from "../strategy";
import type { Card } from "@/lib/types";

const base = (over: Partial<StrategyInput>): StrategyInput => ({
  street: "preflop", hole: ["As", "Kd"], board: [], equity: 0.5, potOdds: 0.3, pot: 3, toCall: 1, currentBet: 2, stack: 199, committed: 1, position: "BTN/SB", live: 1,
  legal: ["fold", "call", "raise", "allin"], minTotal: 4, maxTotal: 200, bigBlind: 2, hasInitiative: false, raisesThisStreet: 0, roll: 0.5, ...over,
});

describe("chen score", () => {
  it("scores the classic examples", () => {
    expect(chenScore(["As", "Ad"])).toBe(20);
    expect(chenScore(["Ks", "Kd"])).toBe(16);
    expect(chenScore(["As", "Ks"])).toBe(12);
    expect(chenScore(["Ts", "Td"])).toBe(10);
    expect(chenScore(["7s", "2d"])).toBeLessThanOrEqual(0);
  });
  it("top share is monotone and sane", () => {
    expect(topShare(20)).toBeCloseTo(0.0045, 2);
    expect(topShare(10)).toBeGreaterThan(topShare(12));
    expect(topShare(-10)).toBe(1);
  });
});

describe("hand reading", () => {
  it("names pair types", () => {
    expect(readHand(["Ks", "Kd"], ["9h", "5c", "2d"]).category).toBe("overpair");
    expect(readHand(["Ah", "9d"], ["9h", "5c", "2d"]).category).toBe("top pair, good kicker");
    expect(readHand(["6h", "5d"], ["9h", "5c", "2d"]).category).toBe("middle pair");
    expect(readHand(["7h", "7d"], ["9h", "5c", "2d"]).category).toBe("pocket pair below the top card");
    expect(readHand(["3h", "3d"], ["9h", "5c", "2d"]).category).toBe("small pocket pair");
  });
  it("finds draws and outs", () => {
    const fd = readHand(["Ah", "7h"], ["Kh", "9h", "2c"]);
    expect(fd.draws).toContain("flush draw");
    expect(fd.outs).toBeGreaterThanOrEqual(9);
    const oesd = readHand(["9s", "8d"], ["7h", "6c", "2d"]);
    expect(oesd.draws).toContain("open-ended straight draw");
    expect(readHand(["9s", "8d"], ["7h", "6c", "5d", "Ac", "2s"]).draws).toHaveLength(0);
  });
});

describe("preflop", () => {
  it("opens premium hands and folds junk", () => {
    const open = recommend(base({ hole: ["As", "Kd"], toCall: 1 }));
    expect(["raise", "bet"]).toContain(open.action);
    expect(open.amount).toBeGreaterThanOrEqual(4);
    expect(recommend(base({ hole: ["7s", "2d"], toCall: 1, position: "UTG", legal: ["fold", "call", "raise", "allin"] })).action).toBe("fold");
  });
  it("re-raises aces vs a raise, folds weak vs a 3-bet, calls suited connectors cheaply in position", () => {
    expect(recommend(base({ hole: ["Ah", "Ad"], toCall: 6, currentBet: 8, raisesThisStreet: 1, minTotal: 14 })).action).toBe("raise");
    expect(recommend(base({ hole: ["Jh", "8d"], toCall: 20, currentBet: 24, raisesThisStreet: 2, minTotal: 44, potOdds: 0.45 })).action).toBe("fold");
    expect(recommend(base({ hole: ["8h", "7h"], toCall: 4, currentBet: 6, raisesThisStreet: 1, position: "BTN", potOdds: 0.3, minTotal: 10 })).action).toBe("call");
  });
  it("jams a short stack with a premium hand facing a raise", () => {
    expect(recommend(base({ hole: ["Qh", "Qd"], stack: 20, committed: 1, toCall: 6, currentBet: 8, raisesThisStreet: 1, minTotal: 14, maxTotal: 21 })).action).toBe("allin");
  });
});

describe("postflop", () => {
  const flop = (over: Partial<StrategyInput>) => base({ street: "flop", board: ["Kh", "9c", "2d"], legal: ["check", "bet", "allin"], toCall: 0, currentBet: 0, pot: 12, minTotal: 2, ...over });
  it("value bets top pair and monsters, sizes by street", () => {
    const tp = recommend(flop({ hole: ["Ah", "Kd"], equity: 0.8 }));
    expect(tp.action).toBe("bet");
    expect(tp.amount).toBe(6);
    const river = recommend(flop({ street: "river", board: ["Kh", "9c", "2d", "5s", "Jc"], hole: ["Kd", "Ks"], equity: 0.95, roll: 0.9 }));
    expect(river.action).toBe("bet");
    expect(river.amount).toBe(10);
  });
  it("semi-bluffs a flush draw and calls it at the right price", () => {
    expect(recommend(flop({ hole: ["Ah", "7h"], board: ["Kh", "9h", "2c"], equity: 0.45, roll: 0.3 })).action).toBe("bet");
    const priced = recommend(flop({ hole: ["Ah", "7h"], board: ["Kh", "9h", "2c"], equity: 0.36, legal: ["fold", "call", "raise", "allin"], toCall: 6, currentBet: 6, pot: 18, potOdds: 0.25, minTotal: 12, roll: 0.9 }));
    expect(priced.action).toBe("call");
    const overpriced = recommend(flop({ hole: ["Ah", "7h"], board: ["Kh", "9h", "2c"], equity: 0.36, legal: ["fold", "call", "raise", "allin"], toCall: 60, currentBet: 60, pot: 42, potOdds: 0.59, minTotal: 120, roll: 0.9 }));
    expect(overpriced.action).toBe("fold");
  });
  it("continuation-bets air with initiative heads-up but not multiway, and folds air to a bet", () => {
    expect(recommend(flop({ hole: ["Ah", "Qd"], hasInitiative: true, roll: 0.3, live: 1 })).action).toBe("bet");
    expect(recommend(flop({ hole: ["Ah", "Qd"], hasInitiative: true, roll: 0.3, live: 3 })).action).toBe("check");
    expect(recommend(flop({ hole: ["7h", "4d"], equity: 0.12, legal: ["fold", "call", "raise", "allin"], toCall: 8, currentBet: 8, pot: 20, potOdds: 0.29, minTotal: 16 })).action).toBe("fold");
  });
  it("jams a set at a shallow stack-to-pot ratio", () => {
    expect(recommend(flop({ hole: ["9h", "9d"], equity: 0.9, stack: 15, committed: 0, pot: 12, maxTotal: 15 })).action).toBe("allin");
  });
  it("decision roll is deterministic and in range", () => {
    const r = decisionRoll(3, "turn", ["As", "Kd"] as Card[]);
    expect(r).toBe(decisionRoll(3, "turn", ["As", "Kd"] as Card[]));
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThan(1);
  });
});
