import { describe, expect, it } from "vitest";
import { computeBaseline, updateBaselineAfterDecision } from "../baseline";
import { fuseTells } from "../fuse";
import type { TellFrame, TellSnapshot } from "@/lib/types";

const frame = (t: number, over: Partial<TellFrame> = {}): TellFrame => ({
  t, facePresent: true, confidence: 1, blinkRate: 15, gaze: "cards", headMotion: 0.002, tension: 0.1, smile: 0.05, duchenne: false,
  emotion: { neutral: 1, happy: 0, surprise: 0, fear: 0, anger: 0, disgust: 0, sad: 0 }, fakeSmile: false, ...over,
});
const series = (n: number, over: Partial<TellFrame> = {}) => Array.from({ length: n }, (_, i) => frame(1_000_000 + i * 250, over));
const window = (headMotion: number): TellSnapshot => ({ handNumber: 1, street: "flop", decisionLatencyMs: 4000, frames: series(12, { headMotion }), cardRevealReactions: [] });
const signals = (v: ReturnType<typeof fuseTells>) => v.evidence.map((e) => e.signal);

describe("freeze is a deviation from the player's own decisions", () => {
  // Calibration is far more animated than play, the case that used to flag nearly every decision.
  const calibrated = () => computeBaseline(series(40, { headMotion: 0.01 }));

  it("never fires on the first decision, even when the player is much stiller than at calibration", () => {
    expect(signals(fuseTells(window(0.0005), calibrated()))).not.toContain("freeze");
  });

  it("does not fire on a typical decision once the player's usual stillness is known", () => {
    let b = calibrated();
    for (const m of [0.001, 0.0012, 0.0009]) b = updateBaselineAfterDecision(b, window(m), 4000);
    expect(signals(fuseTells(window(0.001), b))).not.toContain("freeze");
  });

  it("fires when a decision is far stiller than the player's usual, and says by how much", () => {
    let b = calibrated();
    for (const m of [0.001, 0.0012, 0.0009]) b = updateBaselineAfterDecision(b, window(m), 4000);
    const v = fuseTells(window(0.0002), b);
    const freeze = v.evidence.find((e) => e.signal === "freeze");
    expect(freeze?.direction).toBe("bluff");
    expect(freeze?.text).toMatch(/20% of usual motion/);
    expect(v.bluffLikelihood).toBeGreaterThan(0.5);
  });

  it("keeps firing for a player who freezes on a minority of decisions", () => {
    let b = calibrated();
    for (const m of [0.001, 0.001, 0.0003, 0.001, 0.001, 0.0003, 0.001]) b = updateBaselineAfterDecision(b, window(m), 4000);
    expect(signals(fuseTells(window(0.0003), b))).toContain("freeze");
  });
});

describe("timing survives unavailable camera signals", () => {
  it("retains timing without face frames or facial calibration, without claiming a bluff", () => {
    const snap = { ...window(0), frames: [], decisionReferenceMs: 4000, decisionLatencyMs: 10_000 };
    const vector = fuseTells(snap, null);
    expect(signals(vector)).toEqual(["slow_action"]);
    expect(vector.confidence).toBeGreaterThan(0);
    expect(vector.bluffLikelihood).toBe(0.5);
    expect(fuseTells({ ...snap, decisionLatencyMs: 1000 }, null).evidence[0].direction).toBe("neutral");
  });
  it("does not infer timing when there is no reference or the turn was interrupted", () => {
    expect(fuseTells({ ...window(0), frames: [] }, null).evidence).toEqual([]);
    expect(fuseTells({ ...window(0), frames: [], decisionReferenceMs: 4000, decisionLatencyMs: 0 }, null).evidence).toEqual([]);
  });
});
