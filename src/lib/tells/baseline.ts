/**
 * Calibration: 10 seconds of "relax and look at the camera" -> BaselineStats.
 * Pattern ported from Haggle's stress.ts (delta-from-baseline scoring).
 */

import type { BaselineStats, TellFrame } from "@/lib/types";

export const CALIBRATION_MS = 10_000;

export function computeBaseline(frames: TellFrame[]): BaselineStats {
  const valid = frames.filter((f) => f.facePresent);
  const avg = (sel: (f: TellFrame) => number) => (valid.length ? valid.reduce((a, f) => a + sel(f), 0) / valid.length : 0);
  return {
    blinkRate: Math.max(avg((f) => f.blinkRate), 6), // floor so ratios stay sane
    headMotion: Math.max(avg((f) => f.headMotion), 1e-6),
    tension: avg((f) => f.tension),
    smile: avg((f) => f.smile),
    decisionLatencyMs: 4000,
    calibratedAt: Date.now(),
  };
}

/** Running median-ish update for decision latency (keeps the baseline adaptive). */
export function updateLatencyBaseline(baseline: BaselineStats, latencyMs: number, alpha = 0.2): BaselineStats {
  return { ...baseline, decisionLatencyMs: baseline.decisionLatencyMs + alpha * (latencyMs - baseline.decisionLatencyMs) };
}
