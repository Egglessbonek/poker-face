import type { RateReading } from "./types";
export type Metric = "pulse" | "breathing";
export interface RawRate { value?: number; confidence?: number; stable?: boolean; at?: number }
// Keep the established default until a reference-device comparison supports changing it.
export const MIN_CONFIDENCE = 70;
export const WINDOWS = { pulse: 12_000, breathing: 30_000 };
export interface QualityPolicy { pulse: number; breathing: number }
export const DEFAULT_POLICY: QualityPolicy = { pulse: 70, breathing: 70 };
export function confidencePolicy(pulse?: string, breathing?: string): QualityPolicy {
  const parse = (v?: string) => v?.trim() && Number.isFinite(Number(v)) ? Math.max(50, Math.min(100, Number(v))) : MIN_CONFIDENCE;
  return { pulse: parse(pulse), breathing: parse(breathing) };
}
export interface ArtifactTimes { motionAt?: number; mouthMovementAt?: number }
export interface QualityOptions extends ArtifactTimes { threshold?: number }
// Installed SDK enum: 7 is chest-not-visible, a breathing-specific condition.
export function blocksMetric(code: number | null, kind: Metric): boolean { return code !== 0 && !(code === 7 && kind === "pulse"); }
export function qualifyRate(raw: RawRate | undefined, kind: Metric, startedAt: number, at: number, validationCode: number | null, options: QualityOptions = {}): RateReading {
  const end = raw?.at ?? at, windowMs = WINDOWS[kind];
  const confidence = Math.min(100, Math.max(0, Number.isFinite(raw?.confidence) ? raw!.confidence! : 0));
  const value = typeof raw?.value === "number" && Number.isFinite(raw.value) ? raw.value : null;
  const flags: NonNullable<RateReading["reasons"]> = [];
  if (end - startedAt < windowMs) flags.push("warming");
  if (!Number.isFinite(end) || end > at + 1000 || at - end > 3000) flags.push("stale");
  if (value === null) flags.push("missing");
  if (blocksMetric(validationCode, kind)) flags.push("tracking");
  if (!raw?.stable) flags.push("unstable");
  if (confidence < (options.threshold ?? MIN_CONFIDENCE)) flags.push("confidence");
  // The overview still says 40–110 while the newer card says 40–180. Keep the
  // narrower pulse range until Presage confirms which model is served to this key.
  if (value !== null && (kind === "pulse" ? value < 40 || value > 110 : value < 5 || value > 40)) flags.push("range");
  if (options.motionAt !== undefined && options.motionAt >= end - windowMs && options.motionAt <= at) flags.push("motion");
  if (kind === "breathing" && options.mouthMovementAt !== undefined && options.mouthMovementAt >= end - windowMs && options.mouthMovementAt <= at) flags.push("mouth_movement");
  const reason = flags.length ? flags[0] : "usable";
  const quality = reason === "warming" || reason === "usable" ? reason : reason === "missing" || reason === "stale" ? "unavailable" : "degraded";
  return { value: quality === "usable" ? value : null, confidence, stable: raw?.stable === true, quality, reason, reasons: flags, windowMs, windowStart: end - windowMs, windowEnd: end };
}

/** Re-check live status without reviving rejected or out-of-date estimates. */
export function refreshRate(reading: RateReading, startedAt: number, now: number, validationCode: number | null, kind: Metric = "pulse", artifacts: ArtifactTimes = {}): RateReading {
  const fresh = qualifyRate({ value: reading.value ?? undefined, confidence: reading.confidence, stable: reading.stable, at: reading.windowEnd }, kind, startedAt, now, validationCode, { ...artifacts, threshold: 0 });
  const newReasons = fresh.reasons!.filter(r => r !== "missing");
  const reasons = [...new Set([...newReasons, ...(reading.reasons ?? (reading.reason && reading.reason !== "usable" ? [reading.reason] : []))])];
  if (!reasons.length) return reading;
  const reason = reasons[0];
  return { ...reading, value: null, quality: reason === "warming" ? "warming" : reason === "stale" || reason === "missing" ? "unavailable" : "degraded", reason, reasons };
}

/** First 15 distinct valid source timestamps; overlapping windows are not independent observations. */
export function referenceRate(readings: RateReading[]): number | null {
  const unique = new Map<number, number>();
  for (const r of readings) if (r.quality === "usable" && r.value !== null && !unique.has(r.windowEnd)) { unique.set(r.windowEnd, r.value); if (unique.size === 15) break; }
  if (unique.size < 15) return null;
  const values = [...unique.values()].sort((a, b) => a - b);
  return values[7];
}
