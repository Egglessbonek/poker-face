/** Private measurements; deliberately separate from TellVector and the public match log. */
export type MetricQuality = "warming" | "unavailable" | "degraded" | "usable";
export type RejectionReason = "warming" | "missing" | "stale" | "tracking" | "unstable" | "confidence" | "range" | "motion" | "mouth_movement";
export interface RateReading {
  value: number | null;
  confidence: number;
  stable: boolean;
  quality: MetricQuality;
  reason?: RejectionReason | "usable";
  reasons?: RejectionReason[];
  windowMs: number;
  windowStart: number;
  windowEnd: number;
}
export interface VitalsSample {
  at: number;
  handNumber: number;
  pulse: RateReading;
  breathing: RateReading;
  validation: { code: number | null; hint: string };
}
export interface PressureEvent { at: number; handNumber: number; label: string; kind?: "start" | "end" | "action"; playerId?: string; latencyMs?: number }
export interface VitalsView {
  serverNow: number;
  validation: { code: number | null; hint: string };
  available: boolean;
  sessionId: string | null;
  status: "off" | "starting" | "measuring" | "stopped" | "error";
  message: string;
  retryable?: boolean;
  startedAt: number | null;
  latest: VitalsSample | null;
  baseline: { pulse: number | null; breathing: number | null };
  history: VitalsSample[];
  events: PressureEvent[];
  lastGood?: { pulse: RateReading | null; breathing: RateReading | null };
  diagnostics?: import("./diagnostics").SignalDiagnostics;
  moments?: PressureMoment[];
}

export interface PressureMoment {
  handNumber: number;
  text: string;
  context: string;
  challenge: string;
}
/** Browser-derived artifact hint. Mouth movement is not a speech/emotion classifier. */
export interface CaptureContext { at: number; mouthMoving: boolean }
export interface CaptureStats {
  fps: number; encoded: number; dropped: number; encodeMs: number;
  uploadMs: number; queued: number; width: number; height: number;
}
