import { WINDOWS } from "./quality";
import type { RateReading, VitalsView } from "./types";

export function warmupRemaining(view: VitalsView, kind: keyof typeof WINDOWS): number {
  if (view.startedAt === null) return Math.ceil(WINDOWS[kind] / 1000);
  return Math.max(0, Math.ceil((WINDOWS[kind] - (view.serverNow - view.startedAt)) / 1000));
}

export function rateStatus(reading: RateReading | undefined, remaining: number, measuring: boolean): string {
  if (!measuring) return "Measurement paused";
  if (reading?.quality === "usable") return `${Math.round(reading.confidence)}% signal confidence`;
  if (remaining > 0) return `Building signal · at least ${remaining}s more`;
  if (reading?.reasons?.includes("mouth_movement")) return "Mouth movement in this breathing window";
  if (reading?.reasons?.includes("motion")) return "Movement in this measurement window";
  if (reading?.reason === "confidence") return `Low signal confidence (${Math.round(reading.confidence)}%)`;
  if (reading?.reason === "unstable") return "Estimate is still stabilizing";
  if (reading?.reason === "stale") return "Waiting for a fresh estimate";
  if (reading?.reason === "tracking") return "Tracking interrupted";
  if (reading?.reason === "range") return "Outside the supported range";
  if (reading?.quality === "degraded") return "Signal not yet reliable";
  return "No current estimate yet";
}

export function pressureStatus(view: VitalsView, measuring: boolean, error: string | null): string {
  if (error) return error;
  if (!measuring) return view.message;
  if (view.validation.code === 12 || view.latest?.breathing.reasons?.includes("mouth_movement") || view.latest?.pulse.reasons?.includes("motion")) return "Play naturally. Measurements resume as clear windows become available.";
  if (view.validation.code !== null && view.validation.code !== 0) return view.validation.hint;
  if (view.status === "starting" || view.message !== "Gathering measurements") return view.message;
  if (view.latest?.pulse.quality === "usable" || view.latest?.breathing.quality === "usable") return "Measuring with your camera.";
  if (warmupRemaining(view, "breathing") > 0) return "Pulse needs at least 12 seconds of video; breathing needs 30 seconds. This continues after face calibration.";
  if (!view.latest) return "Camera connected. Presage has not returned an estimate yet.";
  return "Estimates are not currently usable. Each reading shows the signal status.";
}

/** A previous estimate is explicitly historical and disappears after one minute. */
export function historicalRate(reading: RateReading | null | undefined, now: number): { value: number; age: number } | null {
  if (!reading || reading.quality !== "usable" || reading.value === null) return null;
  const age = Math.floor((now - reading.windowEnd) / 1000);
  return age >= 0 && age <= 60 ? { value: reading.value, age } : null;
}
