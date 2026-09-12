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

/** Face frames a decision window needs before it may move the motion baseline. */
const MIN_DECISION_FRAMES = 4;

/**
 * Geometric running update for head motion. Nobody sits through a decision the way they sat through
 * "relax and look at the camera", so after each decision the motion baseline drifts toward this player's own
 * deciding posture. "Freeze" then means stiller than *they* usually are on a decision, not stiller than the
 * calibration. Multiplicative with a clamped step, so one animated or one frozen decision cannot swing it.
 */
export function updateMotionBaseline(baseline: BaselineStats, decisionHeadMotion: number, alpha = 0.25): BaselineStats {
  if (!Number.isFinite(decisionHeadMotion) || decisionHeadMotion <= 0) return baseline;
  const ratio = Math.min(4, Math.max(0.25, decisionHeadMotion / baseline.headMotion));
  return { ...baseline, headMotion: Math.max(baseline.headMotion * Math.pow(ratio, alpha), 1e-6) };
}

/** Fold one decision window into the adaptive parts of the baseline: latency and head motion. Call after fusing. */
export function updateBaselineAfterDecision(baseline: BaselineStats, snapshot: TellSnapshot, latencyMs: number): BaselineStats {
  let next = updateLatencyBaseline(baseline, latencyMs);
  const frames = snapshot.frames.filter((f) => f.facePresent);
  if (frames.length >= MIN_DECISION_FRAMES) {
    next = updateMotionBaseline(next, frames.reduce((a, f) => a + f.headMotion, 0) / frames.length);
  }
  return next;
}
