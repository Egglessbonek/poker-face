import { qualifyRate, DEFAULT_POLICY, type ArtifactTimes, type Metric, type QualityPolicy, type RawRate } from "./quality";
import type { RateReading, RejectionReason } from "./types";
export interface MetricDiagnostics {
  samples: number; usable: number; coverage: number;
  rejected: Partial<Record<RejectionReason, number>>;
  cutoffs: { threshold: number; usable: number; coverage: number }[];
  confidence: number | null; reasons: RejectionReason[]; lastSourceAt: number | null;
}
export interface PipelineStats {
  at: number; fps: number; submitted: number; dropped: number;
  decodeMs: number; sourceAgeMs: number; queued: number;
}
export interface SignalDiagnostics {
  policy: QualityPolicy;
  pulse: MetricDiagnostics; breathing: MetricDiagnostics;
  pipeline: PipelineStats | null;
  receivedFrames: number; skippedFrames: number;
}
export function createDiagnostics(policy: QualityPolicy = DEFAULT_POLICY): SignalDiagnostics {
  const metric = (): MetricDiagnostics => ({ samples: 0, usable: 0, coverage: 0, rejected: {}, cutoffs: [50, 60, 70, 80, 90].map(threshold => ({ threshold, usable: 0, coverage: 0 })), confidence: null, reasons: [], lastSourceAt: null });
  return { policy, pulse: metric(), breathing: metric(), pipeline: null, receivedFrames: 0, skippedFrames: 0 };
}
/** Counts distinct estimates after warm-up, with all overlapping rejection reasons.
 * Comparison cutoffs change confidence only; no rejected raw values leave this function. */
export function recordQuality(d: SignalDiagnostics, kind: Metric, raw: RawRate | undefined, reading: RateReading, start: number, now: number, code: number | null, artifacts: ArtifactTimes) {
  const m = d[kind];
  m.confidence = raw ? reading.confidence : null; m.reasons = reading.reasons ?? [];
  if (!raw || m.lastSourceAt === reading.windowEnd) return;
  m.lastSourceAt = reading.windowEnd;
  if (reading.reasons?.includes("warming")) return;
  m.samples++;
  if (reading.quality === "usable") m.usable++;
  m.coverage = Math.round(100 * m.usable / m.samples);
  for (const reason of reading.reasons ?? []) m.rejected[reason] = (m.rejected[reason] ?? 0) + 1;
  for (const c of m.cutoffs) {
    if (qualifyRate(raw, kind, start, now, code, { ...artifacts, threshold: c.threshold }).quality === "usable") c.usable++;
    c.coverage = Math.round(100 * c.usable / m.samples);
  }
}
