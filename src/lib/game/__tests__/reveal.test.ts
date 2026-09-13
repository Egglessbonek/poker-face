import { describe, expect, it, vi } from "vitest";
import type { Player, TellVector, VillainDecision } from "@/lib/types";
import { achievements, buildReveal, type RevealDecision, type RevealPlayer, type TellMoment } from "../reveal";

// reveal.ts is server-only; the marker package throws outside a React Server Component.
vi.mock("server-only", () => ({}));

const player: Player = { id: "h1", seat: 0, name: "Raghu", kind: "human", stack: 1000, connected: true, sittingOut: false };

const tells = (bluffLikelihood: number): TellVector => ({ arousal: 40, bluffLikelihood, confidence: 0.8, trend: "stable", evidence: [] });

const decision = (over: Partial<RevealDecision> = {}): RevealDecision => ({
  handNumber: 1, street: "flop", action: { seat: 0, type: "bet", amount: 40, street: "flop", at: 0 },
  equity: 0.6, liveOpponents: 1, aggressive: true, isBluff: false, tells: null, holeCards: ["As", "Kd"], board: [], ...over,
});
const bluff = (bluffLikelihood: number | null) => decision({ isBluff: true, equity: 0.1, tells: bluffLikelihood === null ? null : tells(bluffLikelihood) });
const value = () => decision({ isBluff: false, equity: 0.8, tells: tells(0.2) });

const human = (over: Partial<RevealPlayer> = {}): RevealPlayer => ({
  player, decisions: [], pokerFace: null, readsRight: 0, readsTotal: 0, leaks: [], peakArousal: null, achievements: [], ...over,
});

const villain = (over: Partial<VillainDecision> = {}): VillainDecision => ({ action: "fold", reasoning: "", tableTalk: "", tellsUsed: [], mathAction: "fold", llmUsed: false, ...over });
const moment = (over: Partial<TellMoment> = {}): TellMoment => ({
  handNumber: 1, street: "flop", aiName: "Claude", aiSeat: 1, aiEquity: 0.5,
  decision: villain(), situation: null, result: null, reads: [], caughtBluff: null, ...over,
});
const read = (name: string) => ({
  name, bluffLikelihood: 0.8, confidence: 0.8, actual: null,
  evidence: [{ signal: "blink_rate", direction: "bluff" as const, strength: 0.7, text: "blink rate 2x baseline" }],
});

const ids = (p: RevealPlayer, moments: TellMoment[] = []) => achievements(p, moments).map((a) => a.id);

describe("achievements", () => {
  it("earns nothing from an empty match", () => {
    expect(achievements(human(), [])).toEqual([]);
  });

  it("stone_cold needs a high poker face and at least 3 graded decisions", () => {
    expect(ids(human({ pokerFace: 90, readsTotal: 2 }))).not.toContain("stone_cold");
    expect(ids(human({ pokerFace: 79, readsTotal: 3 }))).not.toContain("stone_cold");
    expect(ids(human({ pokerFace: null, readsTotal: 3 }))).not.toContain("stone_cold");
    const [badge] = achievements(human({ pokerFace: 80, readsTotal: 3 }), []);
    expect(badge).toMatchObject({ id: "stone_cold", title: "Stone Cold", tone: "gold" });
  });

  it("open_book is a poker face of 30 or less, never without a camera", () => {
    expect(ids(human({ pokerFace: 30 }))).toEqual(["open_book"]);
    expect(ids(human({ pokerFace: 31 }))).toEqual([]);
    expect(ids(human({ pokerFace: null }))).toEqual([]);
    expect(achievements(human({ pokerFace: 0 }), [])[0].tone).toBe("danger");
  });

  it("bluff_artist counts bluffs that slipped past, caught_red_handed the ones that did not", () => {
    expect(ids(human({ decisions: [bluff(0.2), bluff(0.49)] }))).toEqual(["bluff_artist"]);
    expect(ids(human({ decisions: [bluff(0.2)] }))).toEqual([]);
    expect(ids(human({ decisions: [bluff(0.7)] }))).toEqual(["caught_red_handed"]);
    // 0.5..0.7 is neither slipped nor caught.
    expect(ids(human({ decisions: [bluff(0.5), bluff(0.69)] }))).toEqual([]);
    // No tell data on a bluff counts for neither.
    expect(ids(human({ decisions: [bluff(null), bluff(null)] }))).toEqual([]);
    expect(ids(human({ decisions: [bluff(0.1), bluff(0.3), bluff(0.9)] }))).toEqual(["bluff_artist", "caught_red_handed"]);
  });

  it("top leak signal picks exactly one of chip_glancer, frozen, speed_demon", () => {
    const leak = (signal: string) => ({ signal, text: signal, count: 3, direction: "bluff" as const });
    expect(ids(human({ leaks: [leak("controls_glance"), leak("freeze")] }))).toEqual(["chip_glancer"]);
    expect(ids(human({ leaks: [leak("freeze"), leak("controls_glance")] }))).toEqual(["frozen"]);
    expect(ids(human({ leaks: [leak("fast_action")] }))).toEqual(["speed_demon"]);
    expect(ids(human({ leaks: [leak("blink_rate"), leak("freeze")] }))).toEqual([]);
  });

  it("honest_to_a_fault needs 3 aggressive decisions and no bluffs", () => {
    expect(ids(human({ decisions: [value(), value(), value()] }))).toEqual(["honest_to_a_fault"]);
    expect(ids(human({ decisions: [value(), value()] }))).toEqual([]);
    expect(ids(human({ decisions: [value(), value(), value(), bluff(0.6)] }))).toEqual([]);
    // Passive decisions do not count as aggressive.
    expect(ids(human({ decisions: [value(), value(), decision({ aggressive: false, action: { seat: 0, type: "call", street: "flop", at: 0 } })] }))).toEqual([]);
  });

  it("they_were_listening needs an AI that read this player and overruled its math", () => {
    const listened = moment({ decision: villain({ action: "fold", mathAction: "call", tellsUsed: ["blink_rate"] }), reads: [read("Raghu")] });
    const readButObeyed = moment({ decision: villain({ action: "call", mathAction: "call" }), reads: [read("Raghu")] });
    const someoneElse = moment({ decision: villain({ action: "fold", mathAction: "call" }), reads: [read("Sam")] });
    expect(ids(human(), [listened])).toEqual(["they_were_listening"]);
    expect(achievements(human(), [listened])[0].tone).toBe("danger");
    expect(ids(human(), [readButObeyed])).toEqual([]);
    expect(ids(human(), [someoneElse])).toEqual([]);
    expect(ids(human(), [someoneElse, readButObeyed, listened])).toEqual(["they_were_listening"]);
  });

  it("marathon is 10 or more decisions of any kind", () => {
    const passive = () => decision({ aggressive: false, action: { seat: 0, type: "check", street: "flop", at: 0 } });
    expect(ids(human({ decisions: Array.from({ length: 9 }, passive) }))).toEqual([]);
    expect(ids(human({ decisions: Array.from({ length: 10 }, passive) }))).toEqual(["marathon"]);
  });

  it("returns at most 5 badges, in the fixed order, dropping the later ones", () => {
    const listened = moment({ decision: villain({ action: "raise", mathAction: "call" }), reads: [read("Raghu")] });
    const decisions = [
      bluff(0.9), bluff(0.1), bluff(0.2), // caught once, slipped twice (out of order on purpose)
      ...Array.from({ length: 7 }, value), // pads to 10 decisions for marathon
    ];
    const p = human({ pokerFace: 85, readsTotal: 4, readsRight: 3, decisions, leaks: [{ signal: "controls_glance", text: "eyed the bet controls right after the flop", count: 4, direction: "strength" }] });
    // Six rules apply: stone_cold, bluff_artist, caught_red_handed, chip_glancer, they_were_listening, marathon.
    expect(ids(p, [listened])).toEqual(["stone_cold", "bluff_artist", "caught_red_handed", "chip_glancer", "they_were_listening"]);
    expect(achievements(p, [listened])).toHaveLength(5);
    // Without the tell moment, marathon fits in the fifth slot.
    expect(ids(p, [])).toEqual(["stone_cold", "bluff_artist", "caught_red_handed", "chip_glancer", "marathon"]);
  });

  it("every badge has a title, a blurb without exclamation marks, and a known tone", () => {
    const everything = human({
      pokerFace: 85, readsTotal: 3,
      decisions: [bluff(0.1), bluff(0.2), bluff(0.9)],
      leaks: [{ signal: "freeze", text: "went still", count: 2, direction: "bluff" }],
    });
    const earned = achievements(everything, []);
    expect(earned.length).toBeGreaterThan(0);
    for (const a of earned) {
      expect(a.title.length).toBeGreaterThan(0);
      expect(a.blurb).not.toContain("!");
      expect(["gold", "danger", "ok", "muted"]).toContain(a.tone);
    }
  });
});

describe("buildReveal", () => {
  it("drops a hand the host voided, including its actions", () => {
    const ai: Player = { id: "a1", seat: 1, name: "Claude", kind: "ai", stack: 1000, connected: true, sittingOut: false };
    const seats = [{ seat: 0, playerId: "h1", stack: 1000, holeCards: ["As", "Kd"] }, { seat: 1, playerId: "a1", stack: 1000, holeCards: ["2c", "7d"] }];
    const action = (handNumber: number) => ({ handNumber, playerId: "h1", action: { seat: 0, type: "bet", amount: 40, street: "flop", at: 0 }, tells: tells(0.6) });
    const log = {
      code: "KXTR", createdAt: 0, endedAt: 10,
      config: { startingStack: 1000 } as never,
      players: [player, ai], baselines: {},
      entries: [
        { t: 1, kind: "hand_start" as const, data: { handNumber: 1, button: 0, seats } },
        { t: 2, kind: "action" as const, data: action(1) },
        { t: 3, kind: "hand_end" as const, data: { handNumber: 1, board: ["2h", "9s", "Jc"], foldedOut: true } },
        { t: 4, kind: "hand_start" as const, data: { handNumber: 2, button: 1, seats } },
        { t: 5, kind: "action" as const, data: action(2) },
        { t: 6, kind: "hand_end" as const, data: { handNumber: 2, voided: true, reason: "host ended the match" } },
      ],
    };
    const data = buildReveal(log as never);
    expect(data.hands.map((h) => h.handNumber)).toEqual([1]);
    expect(data.humans[0].decisions.map((d) => d.handNumber)).toEqual([1]);
  });

  it("marks a tell-driven call as a successful bluff catch only when the AI wins", () => {
    const ai: Player = { id: "a1", seat: 1, name: "Claude", kind: "ai", stack: 1010, connected: true, sittingOut: false };
    const humanAction = { seat: 0, type: "bet" as const, amount: 10, street: "river" as const, at: 20 };
    const humanTells = tells(0.82);
    humanTells.evidence = [{ signal: "blink_rate", direction: "bluff", strength: 0.7, text: "blink rate 2x baseline" }];
    const board = ["Kh", "Qh", "Jc", "4s", "3d"];
    const log = {
      code: "READ", createdAt: 0, endedAt: 40,
      config: { startingStack: 1000 } as never,
      players: [player, ai], baselines: {},
      entries: [
        { t: 1, kind: "hand_start" as const, data: { handNumber: 1, button: 0, seats: [
          { seat: 0, playerId: "h1", stack: 1000, holeCards: ["2c", "7d"] },
          { seat: 1, playerId: "a1", stack: 1000, holeCards: ["As", "Ad"] },
        ] } },
        { t: 20, kind: "action" as const, data: { handNumber: 1, playerId: "h1", action: humanAction, tells: humanTells } },
        { t: 21, kind: "ai_decision" as const, data: {
          handNumber: 1, street: "river", playerId: "a1", equity: 0.9,
          opponents: [{ seat: 0, name: "Raghu", kind: "human", stack: 990, committed: 10, folded: false, allIn: false, position: "BTN", tells: humanTells }],
          decision: villain({ action: "call", mathAction: "fold", tellAction: "call", tellsUsed: ["blink_rate"] }),
          situation: { board, pot: 20, currentBet: 10, toCall: 10, aiSeat: 1, aiStack: 990, aiCommitted: 0, aiPosition: "BB", aiHoleCards: ["As", "Ad"], actions: [humanAction] },
        } },
        { t: 30, kind: "hand_end" as const, data: { handNumber: 1, board, pots: [{ amount: 30, eligible: [0, 1] }], results: [{ seat: 0, won: 0 }, { seat: 1, won: 30, descr: "Pair of Aces" }] } },
      ],
    };

    const data = buildReveal(log as never);
    expect(data.tellMoments).toHaveLength(1);
    expect(data.tellMoments[0].caughtBluff).toMatchObject({ name: "Raghu", bluffLikelihood: 0.82, actual: { isBluff: true } });
    expect(data.tellMoments[0].situation).toMatchObject({ pot: 20, toCall: 10, aiPosition: "BB" });
    expect(data.tellMoments[0].result?.results?.find((entry) => entry.won > 0)?.seat).toBe(1);
  });

  it("normalizes legacy reads and matches the latest human action before the AI decision", () => {
    const ai: Player = { id: "a1", seat: 1, name: "Claude", kind: "ai", stack: 1000, connected: true, sittingOut: false };
    const legacyTell = { arousal: 40, bluffLikelihood: 0.65, trend: "stable", evidence: [] };
    const flopAction = { seat: 0, type: "bet" as const, amount: 20, street: "flop" as const, at: 10 };
    const laterAction = { seat: 0, type: "bet" as const, amount: 40, street: "river" as const, at: 30 };
    const board = ["2h", "9s", "Jc", "4d", "3c"];
    const log = {
      code: "OLD1", createdAt: 0, endedAt: 40,
      config: { startingStack: 1000 } as never,
      players: [player, ai], baselines: {},
      entries: [
        { t: 1, kind: "hand_start" as const, data: { handNumber: 1, button: 0, seats: [
          { seat: 0, playerId: "h1", stack: 1000, holeCards: ["As", "Kd"] },
          { seat: 1, playerId: "a1", stack: 1000, holeCards: ["Qc", "Qd"] },
        ] } },
        { t: 10, kind: "action" as const, data: { handNumber: 1, playerId: "h1", action: flopAction, tells: legacyTell } },
        { t: 20, kind: "ai_decision" as const, data: {
          handNumber: 1, street: "turn", playerId: "a1", equity: 0.6,
          opponents: [{ id: "h1", seat: 0, name: "Raghu", kind: "human", stack: 980, committed: 20, folded: false, allIn: false, position: "BTN", tells: legacyTell }],
          decision: villain({ action: "call", mathAction: "fold", tellAction: "call", tellsUsed: ["Raghu: 65% bluff likelihood overall"] }),
        } },
        { t: 30, kind: "action" as const, data: { handNumber: 1, playerId: "h1", action: laterAction, tells: legacyTell } },
        { t: 40, kind: "hand_end" as const, data: { handNumber: 1, board, foldedOut: true } },
      ],
    };

    const data = buildReveal(log as never);
    expect(data.tellMoments).toHaveLength(1);
    expect(data.tellMoments[0].situation).toBeNull();
    expect(data.tellMoments[0].reads[0].confidence).toBeNull();
    expect(data.tellMoments[0].reads[0].actual?.action).toEqual(flopAction);
  });
});
