import { describe, expect, it } from "vitest";
import { activeSeats, applyAction, bounds, computePots, legalActions, newHand, nextSeat, positionLabel, publicHand, totalChips, type SeatInput } from "../engine";
import type { Card, HandState } from "@/lib/types";

const cfg = { smallBlind: 1, bigBlind: 2 };
const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

/** Build a table of `stacks` (null = empty seat) and deal hand 1. */
function deal(stacks: (number | null)[], button = 0, seed = 42): HandState {
  const seats: (SeatInput | null)[] = stacks.map((s, i) => (s === null ? null : { playerId: `p${i}`, stack: s }));
  return newHand(1, seats, button, cfg, seeded(seed));
}

/** Force hole cards and the run-out so showdown tests are deterministic. `deck` is in pop order (last card = first flop card). */
function rig(h: HandState, holes: Record<number, [Card, Card]>, runout: Card[]): HandState {
  for (const [seat, cards] of Object.entries(holes)) h.seats[Number(seat)]!.holeCards = [...cards];
  h.deck = [...runout].reverse();
  return h;
}

const act = (h: HandState, seat: number, type: Parameters<typeof applyAction>[1]["type"], amount?: number) => applyAction(h, { seat, type, amount }, cfg);
const stacks = (h: HandState) => h.seats.map((s) => s?.stack ?? null);

describe("heads-up", () => {
  it("button posts SB and acts first preflop", () => {
    const h = deal([200, 200]);
    expect(h.seats[0]!.committed).toBe(1);
    expect(h.seats[1]!.committed).toBe(2);
    expect(h.pot).toBe(3);
    expect(h.toAct).toBe(0);
    expect(legalActions(h, 0, cfg)).toEqual(["fold", "call", "raise", "allin"]);
    expect(bounds(h, 0, cfg)).toEqual({ toCall: 1, minTotal: 4, maxTotal: 200 });
    expect(positionLabel(h, 0)).toBe("BTN/SB");
    expect(positionLabel(h, 1)).toBe("BB");
  });

  it("BB has the option after SB limps, then acts first postflop", () => {
    let h = deal([200, 200]);
    h = act(h, 0, "call");
    expect(h.street).toBe("preflop");
    expect(h.toAct).toBe(1);
    expect(legalActions(h, 1, cfg)).toEqual(["check", "raise", "allin"]);
    expect(bounds(h, 1, cfg)).toEqual({ toCall: 0, minTotal: 4, maxTotal: 200 });
    h = act(h, 1, "check");
    expect(h.street).toBe("flop");
    expect(h.board).toHaveLength(3);
    expect(h.toAct).toBe(1);
    expect(h.currentBet).toBe(0);
  });

  it("raise sets min raise and reopens action", () => {
    let h = deal([200, 200]);
    h = act(h, 0, "raise", 6);
    expect(h.currentBet).toBe(6);
    expect(h.minRaise).toBe(4);
    expect(h.pot).toBe(8);
    expect(h.lastAggressor).toBe(0);
    expect(bounds(h, 1, cfg)).toEqual({ toCall: 4, minTotal: 10, maxTotal: 200 });
    h = act(h, 1, "raise", 20);
    expect(h.toAct).toBe(0);
    h = act(h, 0, "call");
    expect(h.street).toBe("flop");
    expect(h.pot).toBe(40);
  });

  it("rejects illegal actions and out-of-range amounts", () => {
    const h = deal([200, 200]);
    expect(() => act(h, 1, "call")).toThrow();
    expect(() => act(h, 0, "check")).toThrow();
    expect(() => act(h, 0, "raise", 3)).toThrow();
    expect(() => act(h, 0, "raise", 500)).toThrow();
  });

  it("fold awards the pot and refunds the uncalled raise", () => {
    let h = deal([200, 200]);
    h = act(h, 0, "raise", 10);
    h = act(h, 1, "fold");
    expect(h.over).toBe(true);
    expect(h.foldedOut).toBe(true);
    expect(h.results).toEqual([{ seat: 0, won: 4 }]);
    expect(stacks(h)).toEqual([202, 198]);
  });

  it("all-in call runs out the board and awards the pot", () => {
    let h = deal([200, 200]);
    h = act(h, 0, "allin");
    expect(h.currentBet).toBe(200);
    expect(legalActions(h, 1, cfg)).toEqual(["fold", "call", "allin"]);
    h = act(h, 1, "call");
    expect(h.over).toBe(true);
    expect(h.board).toHaveLength(5);
    expect(h.street).toBe("showdown");
    expect(stacks(h).reduce((a, b) => a! + b!, 0)).toBe(400);
    expect(h.results?.every((r) => r.descr)).toBe(true);
  });

  it("refunds uncalled excess when the short stack is all-in", () => {
    let h = deal([200, 50]);
    h = act(h, 0, "allin");
    h = act(h, 1, "call");
    expect(h.over).toBe(true);
    expect(stacks(h).reduce((a, b) => a! + b!, 0)).toBe(250);
    expect(Math.abs(h.seats[0]!.stack - 200)).toBeLessThanOrEqual(50);
    expect(h.pots).toEqual([{ amount: 100, eligible: [0, 1] }]);
  });

  it("all-in for less than the current bet is a call and closes the action", () => {
    let h = deal([200, 3], 1); // seat 1 on the button posts SB 1 with 3 chips
    h = act(h, 1, "raise", 3);
    expect(h.seats[1]!.allIn).toBe(true);
    expect(legalActions(h, 0, cfg)).toEqual(["fold", "call", "allin"]);
    h = act(h, 0, "call");
    expect(h.over).toBe(true);
    expect(stacks(h).reduce((a, b) => a! + b!, 0)).toBe(203);
  });

  it("blind all-in with nothing left to decide runs out immediately", () => {
    const h = deal([1, 200]); // SB posts their last chip
    expect(h.over).toBe(true);
    expect(h.board).toHaveLength(5);
    expect(stacks(h).reduce((a, b) => a! + b!, 0)).toBe(201);
  });

  it("splits the pot on a chopped board", () => {
    let h = rig(deal([200, 200]), { 0: ["2c", "3d"], 1: ["2h", "3s"] }, ["Ah", "Kh", "Qh", "Jd", "Tc"]);
    h = act(h, 0, "allin");
    h = act(h, 1, "call");
    expect(stacks(h)).toEqual([200, 200]);
    expect(h.results?.map((r) => r.won)).toEqual([200, 200]);
  });
});

describe("three players", () => {
  it("SB left of button, BB next, UTG opens, SB first postflop", () => {
    let h = deal([200, 200, 200], 0);
    expect(h.seats[1]!.committed).toBe(1);
    expect(h.seats[2]!.committed).toBe(2);
    expect(h.toAct).toBe(0);
    expect([0, 1, 2].map((s) => positionLabel(h, s))).toEqual(["BTN", "SB", "BB"]);
    h = act(h, 0, "call");
    h = act(h, 1, "call");
    expect(h.toAct).toBe(2);
    h = act(h, 2, "check");
    expect(h.street).toBe("flop");
    expect(h.toAct).toBe(1);
    expect(h.pot).toBe(6);
  });

  it("a raise reopens action for everyone who already acted", () => {
    let h = deal([200, 200, 200], 0);
    h = act(h, 0, "call");
    h = act(h, 1, "call");
    h = act(h, 2, "raise", 10);
    expect(h.toAct).toBe(0);
    h = act(h, 0, "call");
    expect(h.toAct).toBe(1);
    h = act(h, 1, "fold");
    expect(h.street).toBe("flop");
    expect(activeSeats(h)).toEqual([0, 2]);
    expect(h.pot).toBe(22);
  });

  it("fold-to-one refunds the uncalled part of the raise", () => {
    let h = deal([200, 200, 200], 0);
    h = act(h, 0, "raise", 50);
    h = act(h, 1, "fold");
    h = act(h, 2, "fold");
    expect(h.over).toBe(true);
    expect(stacks(h)).toEqual([203, 199, 198]);
  });

  it("skips a folded player when passing the action", () => {
    let h = deal([200, 200, 200], 0);
    h = act(h, 0, "fold");
    expect(h.toAct).toBe(1);
    h = act(h, 1, "raise", 8);
    expect(h.toAct).toBe(2);
    h = act(h, 2, "call");
    expect(h.street).toBe("flop");
    expect(h.toAct).toBe(1);
  });
});

describe("six-max side pots", () => {
  it("builds three pots from two short all-ins and pays each to its best eligible hand", () => {
    let h = deal([50, 100, 200, 200, null, null], 0);
    // Button 0, SB 1 (1), BB 2 (2), first to act 3.
    expect(h.toAct).toBe(3);
    h = rig(h, { 0: ["Ks", "Kd"], 1: ["Qs", "Qd"], 2: ["2s", "3d"], 3: ["Js", "Jd"] }, ["4h", "7c", "8s", "Th", "5c"]);
    h = act(h, 3, "allin"); // 200
    h = act(h, 0, "allin"); // 50, call for less
    expect(h.actions.at(-1)?.type).toBe("call");
    h = act(h, 1, "allin"); // 100, call for less
    h = act(h, 2, "call"); // 200
    expect(h.over).toBe(true);
    expect(h.street).toBe("showdown");
    expect(h.pots).toEqual([
      { amount: 200, eligible: [0, 1, 2, 3] },
      { amount: 150, eligible: [1, 2, 3] },
      { amount: 200, eligible: [2, 3] },
    ]);
    expect(h.results?.map((r) => [r.seat, r.won])).toEqual([[0, 200], [1, 150], [2, 0], [3, 200]]);
    expect(stacks(h)).toEqual([200, 150, 0, 200, null, null]);
    expect(totalChips(h)).toBe(550);
  });

  it("folded chips stay in the pot but folded seats are never eligible", () => {
    const seats = [
      { playerId: "a", stack: 0, committed: 0, totalIn: 30, holeCards: [], folded: true, allIn: false, acted: true },
      { playerId: "b", stack: 0, committed: 0, totalIn: 20, holeCards: [], folded: false, allIn: true, acted: true },
      { playerId: "c", stack: 100, committed: 0, totalIn: 60, holeCards: [], folded: false, allIn: false, acted: true },
      null,
      { playerId: "d", stack: 100, committed: 0, totalIn: 60, holeCards: [], folded: false, allIn: false, acted: true },
    ];
    expect(computePots(seats)).toEqual([
      { amount: 80, eligible: [1, 2, 4] },
      { amount: 90, eligible: [2, 4] },
    ]);
  });

  it("odd chips go to the first winner left of the button", () => {
    let h = rig(deal([200, 200, 200], 2), { 0: ["2c", "3d"], 1: ["2h", "3s"], 2: ["7c", "8d"] }, ["Ah", "Kh", "Qh", "Jd", "Tc"]);
    // Button 2 → SB 0, BB 1; first to act 2.
    h = act(h, 2, "raise", 5);
    h = act(h, 0, "call");
    h = act(h, 1, "call");
    // flop: SB (0) first
    h = act(h, 0, "check");
    h = act(h, 1, "check");
    h = act(h, 2, "check");
    h = act(h, 0, "check");
    h = act(h, 1, "check");
    h = act(h, 2, "check");
    h = act(h, 0, "check");
    h = act(h, 1, "check");
    h = act(h, 2, "check");
    expect(h.over).toBe(true);
    // Pot 15 chopped three ways (everyone plays the board).
    expect(h.results?.map((r) => r.won).sort()).toEqual([5, 5, 5]);
    expect(totalChips(h)).toBe(600);
  });

  it("labels positions at a full ring", () => {
    const h = deal([200, 200, 200, 200, 200, 200], 0);
    expect([0, 1, 2, 3, 4, 5].map((s) => positionLabel(h, s))).toEqual(["BTN", "SB", "BB", "UTG", "HJ", "CO"]);
  });
});

describe("seat rotation and views", () => {
  it("nextSeat skips empty seats and wraps", () => {
    const h = deal([200, null, 200, null, null, 200], 0);
    expect(nextSeat(h, 0)).toBe(2);
    expect(nextSeat(h, 2)).toBe(5);
    expect(nextSeat(h, 5)).toBe(0);
    expect(h.seats[2]!.committed).toBe(1); // SB
    expect(h.seats[5]!.committed).toBe(2); // BB
    expect(h.toAct).toBe(0);
  });

  it("does not deal to zero-stack seats", () => {
    const h = deal([200, 0, 200], 0);
    expect(h.seats[1]).toBeNull();
    expect(h.seats[2]!.committed).toBe(2);
  });

  it("publicHand hides other players' cards until showdown; rail sees all", () => {
    let h = deal([200, 200, 200], 0);
    const mine = publicHand(h, 1);
    expect(mine.seats[1]!.holeCards).toHaveLength(2);
    expect(mine.seats[0]!.holeCards).toHaveLength(0);
    expect(mine.seats[2]!.holeCards).toHaveLength(0);
    expect("deck" in mine).toBe(false);
    expect(publicHand(h, "all").seats.every((s) => s!.holeCards.length === 2)).toBe(true);

    h = act(h, 0, "fold");
    h = act(h, 1, "allin");
    h = act(h, 2, "call");
    const after = publicHand(h, 0);
    expect(after.seats[1]!.holeCards).toHaveLength(2);
    expect(after.seats[2]!.holeCards).toHaveLength(2);
    expect(after.seats[0]!.holeCards).toHaveLength(2); // own cards
  });

  it("publicHand keeps cards hidden when the hand ends by folds", () => {
    let h = deal([200, 200], 0);
    h = act(h, 0, "fold");
    const v = publicHand(h, 0);
    expect(v.seats[1]!.holeCards).toHaveLength(0);
  });

  it("does not mutate its input", () => {
    const h = deal([200, 200], 0);
    const snapshot = JSON.stringify(h);
    act(h, 0, "raise", 10);
    expect(JSON.stringify(h)).toBe(snapshot);
  });
});
