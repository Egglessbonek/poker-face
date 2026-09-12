import { describe, expect, it } from "vitest";
import { MIN_BLINK_RATE, WARMUP_MS, computeBaseline } from "../baseline";
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
