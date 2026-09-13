import { describe, expect, it } from "vitest";
import type { Action, HandState, Player, TellVector } from "@/lib/types";
import { actionKey, notebookLines, showdownNotes } from "../notes";

const players: Player[] = [
  { id: "h1", seat: 0, name: "Raghu", kind: "human", stack: 200, connected: true, sittingOut: false },
  { id: "a1", seat: 1, name: "Claude", kind: "ai", stack: 200, connected: true, sittingOut: false },
  { id: "a2", seat: 2, name: "GPT", kind: "ai", stack: 200, connected: true, sittingOut: false },
];
const act = (seat: number, type: Action["type"], street: Action["street"], at: number, amount?: number): Action => ({ seat, type, street, at, amount });
const seat = (playerId: string, holeCards: [string, string]) => ({ playerId, stack: 200, committed: 0, totalIn: 0, holeCards, folded: false, allIn: false });
const tells = (bluffLikelihood: number): TellVector => ({ arousal: 60, bluffLikelihood, confidence: 1, trend: "stable", evidence: [{ signal: "freeze", direction: "bluff", strength: 0.5, text: "went unusually still (30% of usual motion)" }] });

/** Raghu bets the river with nothing into a paired board; Claude folds, GPT calls with a pair and wins. */
const hand = (over: Partial<HandState> = {}) => ({
  handNumber: 4,
  board: ["Kh", "Ks", "7d", "2c", "9s"],
  actions: [act(0, "check", "flop", 1), act(1, "check", "flop", 2), act(2, "check", "flop", 3), act(0, "bet", "river", 10, 40), act(1, "fold", "river", 11), act(2, "call", "river", 12, 40)],
  seats: [seat("h1", ["Ac", "3d"]), seat("a1", ["Qd", "Jd"]), seat("a2", ["9c", "8c"])],
  results: [{ seat: 0, won: 0, descr: "Pair, K's" }, { seat: 2, won: 100, descr: "Two Pair, K's & 9's" }],
  foldedOut: false,
  ...over,
} as unknown as HandState);

describe("showdownNotes", () => {
  it("writes one fact per human bet that reached showdown, with the tells and the answers", () => {
    const t = new Map([[actionKey({ seat: 0, at: 10 }), tells(0.62)]]);
    const notes = showdownNotes(hand(), players, t);
    expect(notes).toHaveLength(1);
    const n = notes[0];
    expect(n).toMatchObject({ handNumber: 4, street: "river", name: "Raghu", action: "bet", amount: 40, held: "Pair, K's", bluff: true, won: false });
    expect(n.read).toEqual({ bluffLikelihood: 0.62, evidence: ["went unusually still (30% of usual motion)"] });
    expect(n.responses).toEqual([{ playerId: "a1", name: "Claude", action: "fold" }, { playerId: "a2", name: "GPT", action: "call" }]);
  });

  it("calls a strong bet value and records a win", () => {
    const strong = hand({ seats: [seat("h1", ["Kd", "Kc"]), seat("a1", ["Qd", "Jd"]), seat("a2", ["9c", "8c"])], results: [{ seat: 0, won: 100, descr: "Four of a Kind, K's" }, { seat: 2, won: 0, descr: "Two Pair, K's & 9's" }] } as unknown as Partial<HandState>);
    const [n] = showdownNotes(strong, players);
    expect(n.bluff).toBe(false);
    expect(n.won).toBe(true);
    expect(n.read).toBeUndefined();
  });

  it("writes nothing for a hand that folded out or a human who never showed", () => {
    expect(showdownNotes(hand({ foldedOut: true } as Partial<HandState>), players)).toEqual([]);
    expect(showdownNotes(hand({ results: [{ seat: 2, won: 100, descr: "Two Pair" }] } as Partial<HandState>), players)).toEqual([]);
  });
});

describe("notebookLines", () => {
  it("renders the newest entries per human, naming the reader as 'you'", () => {
    const notes = showdownNotes(hand(), players, new Map([[actionKey({ seat: 0, at: 10 }), tells(0.62)]]));
    const lines = notebookLines(notes, "a1", [{ id: "h1", name: "Raghu" }]);
    expect(lines[0]).toBe("Notebook on Raghu (what they showed at showdowns so far):");
    expect(lines[1]).toContain("H4 river: bet 40 holding Pair, K's, a bluff.");
    expect(lines[1]).toContain("Tells then: 62% bluff (went unusually still (30% of usual motion)).");
    expect(lines[1]).toContain("you folded, GPT called.");
    expect(lines[1]).toContain("They lost the showdown.");
    expect(notebookLines(notes, "a1", [{ id: "nobody", name: "Sam" }])).toEqual([]);
  });
});
