/**
 * Calibration: 10 seconds of "relax and look at the camera" -> BaselineStats.
 * Pattern ported from Haggle's stress.ts (delta-from-baseline scoring).
 *
 * The first seconds are discarded (the landmarker and rolling windows are still settling) and medians are
 * used so a single spike cannot inflate the baseline. Blink rate is floored at a resting human rate.
 */

import type { BaselineStats, TellFrame, TellSnapshot } from "@/lib/types";

export const CALIBRATION_MS = 10_000;
/** Frames this early in the calibration window are warm-up noise. */
export const WARMUP_MS = 2_500;
/** Resting adult blink rate is roughly 12-20/min; never let the baseline fall below the low end. */
export const MIN_BLINK_RATE = 12;
const MIN_FRAMES = 8;

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function computeBaseline(frames: TellFrame[]): BaselineStats {
  const withFace = [...frames].filter((f) => f.facePresent).sort((a, b) => a.t - b.t);
  const start = withFace[0]?.t ?? 0;
  const settled = withFace.filter((f) => f.t - start >= WARMUP_MS);
  const pool = settled.length >= MIN_FRAMES ? settled : withFace;
  // The rolling blink rate ramps up over the window; the last frame has seen the whole calibration.
  const lastBlink = pool.length ? pool[pool.length - 1].blinkRate : 0;
  return {
    blinkRate: Math.max(lastBlink, MIN_BLINK_RATE),
    headMotion: Math.max(median(pool.map((f) => f.headMotion)), 1e-6),
    tension: median(pool.map((f) => f.tension)),
    smile: median(pool.map((f) => f.smile)),
    decisionLatencyMs: 4000,
    calibratedAt: Date.now(),
  };
}

/** Running median-ish update for decision latency (keeps the baseline adaptive). */
export function updateLatencyBaseline(baseline: BaselineStats, latencyMs: number, alpha = 0.2): BaselineStats {
  return { ...baseline, decisionLatencyMs: baseline.decisionLatencyMs + alpha * (latencyMs - baseline.decisionLatencyMs) };
}

/** Decision windows kept as the stillness reference. Odd, so the median is a real window; 7 rides out a 30% freeze rate. */
export const RECENT_WINDOWS = 7;
/** Face frames a decision window needs before it counts as a stillness sample. */
export const MIN_DECISION_FRAMES = 4;

/**
 * Fold one decision window into the adaptive parts of the baseline: latency, and the list of recent
 * decision-window head-motion means. Call after fusing, so the decision is judged against what came before it.
 */
export function updateBaselineAfterDecision(baseline: BaselineStats, snapshot: TellSnapshot, latencyMs: number): BaselineStats {
  const next = updateLatencyBaseline(baseline, latencyMs);
  const frames = snapshot.frames.filter((f) => f.facePresent);
  if (frames.length < MIN_DECISION_FRAMES) return next;
  const mean = frames.reduce((a, f) => a + f.headMotion, 0) / frames.length;
  if (!Number.isFinite(mean)) return next;
  return { ...next, recentHeadMotion: [...(baseline.recentHeadMotion ?? []), mean].slice(-RECENT_WINDOWS) };
}

/**
 * How much this player usually moves while deciding: the median of their recent decision windows. Null before
 * the first window. Never the calibration: nobody decides the way they sat through "relax and look at the
 * camera", and a median (unlike a running average) is not dragged down by the freezes it exists to expose.
 */
export function decidingHeadMotion(baseline: BaselineStats): number | null {
  const recent = baseline.recentHeadMotion;
  return recent && recent.length ? Math.max(median(recent), 1e-6) : null;
}
