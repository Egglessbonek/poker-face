import { describe, expect, it } from "vitest";
import { MIN_BLINK_RATE, WARMUP_MS, computeBaseline, updateBaselineAfterDecision, updateMotionBaseline } from "../baseline";
import type { TellFrame } from "@/lib/types";

const frame = (t: number, over: Partial<TellFrame> = {}): TellFrame => ({
  t, facePresent: true, confidence: 1, blinkRate: 15, gaze: "cards", headMotion: 0.002, tension: 0.1, smile: 0.05, duchenne: false,
  emotion: { neutral: 1, happy: 0, surprise: 0, fear: 0, anger: 0, disgust: 0, sad: 0 }, fakeSmile: false, ...over,
});
const series = (n: number, step = 250, over: (i: number) => Partial<TellFrame> = () => ({})) => Array.from({ length: n }, (_, i) => frame(1_000_000 + i * step, over(i)));

describe("computeBaseline", () => {
  it("ignores warm-up spikes in head motion", () => {
    const frames = series(40, 250, (i) => (i * 250 < WARMUP_MS ? { headMotion: 0.5 } : { headMotion: 0.002 }));
    expect(computeBaseline(frames).headMotion).toBeCloseTo(0.002, 4);
  });
  it("uses the settled blink rate, never below the resting floor", () => {
    const ramp = series(40, 250, (i) => ({ blinkRate: Math.min(18, i * 0.6) }));
    expect(computeBaseline(ramp).blinkRate).toBeCloseTo(18, 1);
    const low = series(40, 250, () => ({ blinkRate: 3 }));
    expect(computeBaseline(low).blinkRate).toBe(MIN_BLINK_RATE);
  });
  it("uses medians so one outlier frame does not move tension", () => {
    const frames = series(40, 250, (i) => ({ tension: i === 20 ? 0.9 : 0.1 }));
    expect(computeBaseline(frames).tension).toBeCloseTo(0.1, 5);
  });
  it("falls back to every face frame when the window is too short to settle", () => {
    const frames = series(6, 250);
    expect(computeBaseline(frames).headMotion).toBeCloseTo(0.002, 4);
  });
  it("skips frames without a face", () => {
    const frames = series(40, 250, (i) => (i % 2 ? { facePresent: false, headMotion: 9 } : {}));
    expect(computeBaseline(frames).headMotion).toBeCloseTo(0.002, 4);
  });
});

describe("adaptive motion baseline", () => {
  const base = () => computeBaseline(series(40, 250));

  it("drifts toward how still the player actually is when deciding", () => {
    let b = base();
    for (let i = 0; i < 8; i++) b = updateMotionBaseline(b, 0.0006);
    expect(b.headMotion).toBeLessThan(0.002 * 0.5);
    expect(b.headMotion).toBeGreaterThan(0.0006 * 0.9);
  });

  it("caps the step so one wild decision cannot swing the baseline", () => {
    const b = base();
    expect(updateMotionBaseline(b, 1).headMotion / b.headMotion).toBeCloseTo(Math.pow(4, 0.25), 3);
    expect(updateMotionBaseline(b, 1e-9).headMotion / b.headMotion).toBeCloseTo(Math.pow(0.25, 0.25), 3);
    expect(updateMotionBaseline(b, 0).headMotion).toBe(b.headMotion);
  });

  it("needs a few face frames before a decision window moves head motion, but latency always adapts", () => {
    const b = base();
    const short = { handNumber: 1, street: "flop" as const, decisionLatencyMs: 8000, frames: series(2, 250, () => ({ headMotion: 0.0001 })), cardRevealReactions: [] };
    const after = updateBaselineAfterDecision(b, short, 8000);
    expect(after.headMotion).toBe(b.headMotion);
    expect(after.decisionLatencyMs).toBeGreaterThan(b.decisionLatencyMs);
    const long = { ...short, frames: series(12, 250, () => ({ headMotion: 0.0001 })) };
    expect(updateBaselineAfterDecision(b, long, 8000).headMotion).toBeLessThan(b.headMotion);
  });
});
