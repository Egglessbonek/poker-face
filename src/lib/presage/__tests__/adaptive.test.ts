import { describe, expect, it } from "vitest";
import { confidencePolicy, qualifyRate, refreshRate, referenceRate } from "../quality";
import { createDiagnostics, recordQuality } from "../diagnostics";
import { historicalRate } from "../presentation";
import { pressureMoments } from "../insights";
import type { PressureEvent, VitalsSample } from "../types";
const now = 100_000;
const raw = { value: 80, at: now, confidence: 65, stable: true };
describe("independent signal policies", () => {
  it("allows chest-only loss for pulse but keeps all face/motion checks", () => {
    expect(qualifyRate({ ...raw, confidence: 90 }, "pulse", 0, now, 7).value).toBe(80);
    expect(qualifyRate({ ...raw, value: 16, confidence: 90 }, "breathing", 0, now, 7).reasons).toContain("tracking");
    for (const code of [null, 1, 2, 3, 5, 6, 10, 11, 12, 17]) expect(qualifyRate({ ...raw, confidence: 99 }, "pulse", 0, now, code).value).toBeNull();
  });
  it("lower confidence never bypasses unstable tracking or supported ranges", () => {
    expect(qualifyRate(raw, "pulse", 0, now, 0, { threshold: 60 }).value).toBe(80);
    expect(qualifyRate({ ...raw, stable: false }, "pulse", 0, now, 0, { threshold: 60 }).value).toBeNull();
    for (const value of [0, 4, 41, Infinity]) expect(qualifyRate({ ...raw, value }, "breathing", 0, now, 0, { threshold: 60 }).value).toBeNull();
    expect(confidencePolicy("bad", "")).toEqual({ pulse: 70, breathing: 70 });
    expect(confidencePolicy("0", "200")).toEqual({ pulse: 50, breathing: 100 });
  });
  it("excludes affected windows until motion has aged out without resetting the stream", () => {
    const opts = { threshold: 60, motionAt: now - 5000 };
    expect(qualifyRate(raw, "pulse", 0, now, 0, opts).reasons).toContain("motion");
    expect(qualifyRate({ ...raw, at: now + 8000 }, "pulse", 0, now + 8000, 0, opts).value).toBe(80);
    const mouth = { threshold: 60, mouthMovementAt: now - 5000 };
    expect(qualifyRate(raw, "pulse", 0, now, 0, mouth).value).toBe(80);
    expect(qualifyRate({ ...raw, value: 16 }, "breathing", 0, now, 0, mouth).reasons).toContain("mouth_movement");
  });
  it("reports all rejection causes and cannot revive a previously redacted value", () => {
    const bad = qualifyRate({ ...raw, stable: false }, "pulse", 0, now, 1);
    expect(bad.reasons).toEqual(["tracking", "unstable", "confidence"]);
    expect(refreshRate(bad, 0, now + 100, 0).value).toBeNull();
    const good = qualifyRate({ ...raw, confidence: 90 }, "pulse", 0, now, 0);
    expect(refreshRate(good, 0, now + 4000, 0).reason).toBe("stale");
    expect(historicalRate(good, now + 10_000)).toEqual({ value: 80, age: 10 });
    expect(historicalRate(good, now + 61_000)).toBeNull();
  });
  it("does not build a personal reference from repeated delivery of one estimate", () => {
    const good = qualifyRate({ ...raw, confidence: 90 }, "pulse", 0, now, 0);
    expect(referenceRate(Array(20).fill(good))).toBeNull();
  });
});
describe("coverage diagnostics", () => {
  it("compares confidence cutoffs while retaining all other rejection checks", () => {
    const d = createDiagnostics();
    const reading = qualifyRate(raw, "pulse", 0, now, 0);
    recordQuality(d, "pulse", raw, reading, 0, now, 0, {});
    recordQuality(d, "pulse", raw, reading, 0, now, 0, {});
    expect(d.pulse.samples).toBe(1);
    expect(d.pulse.cutoffs.find(c => c.threshold === 60)?.coverage).toBe(100);
    expect(d.pulse.cutoffs.find(c => c.threshold === 70)?.coverage).toBe(0);
    const unstable = { ...raw, at: now + 1000, stable: false };
    recordQuality(d, "pulse", unstable, qualifyRate(unstable, "pulse", 0, now + 1000, 0), 0, now + 1000, 0, {});
    expect(d.pulse.cutoffs.find(c => c.threshold === 60)?.coverage).toBe(50);
    expect(d.pulse.rejected).toEqual({ confidence: 2, unstable: 1 });
    expect(JSON.stringify(d)).not.toContain('"value"');
  });
  it("distinguishes missing output and excludes warmup from coverage", () => {
    const d = createDiagnostics();
    recordQuality(d, "pulse", undefined, qualifyRate(undefined, "pulse", 0, 20_000, 0), 0, 20_000, 0, {});
    expect(d.pulse.samples).toBe(0); expect(d.pulse.confidence).toBeNull();
    const warm = { ...raw, at: 5000 };
    recordQuality(d, "pulse", warm, qualifyRate(warm, "pulse", 0, 5000, 0), 0, 5000, 0, {});
    expect(d.pulse.samples).toBe(0);
  });
});
const events: PressureEvent[] = [
  { at: 50_000, handNumber: 1, kind: "start", label: "Dealt" },
  { at: 70_000, handNumber: 1, kind: "action", label: "Call", playerId: "me", latencyMs: 8000 },
  { at: 90_000, handNumber: 1, kind: "end", label: "Ended" },
];
describe("private hand feedback", () => {
  const sample = (at: number, value = 80): VitalsSample => ({ at, handNumber: 1, validation: { code: 0, hint: "" }, pulse: qualifyRate({ ...raw, confidence: 90, at, value }, "pulse", 0, at, 0), breathing: qualifyRate(undefined, "breathing", 0, at, 0) });
  it("uses only valid windows contained within a completed hand", () => {
    const history = [sample(55_000, 110), sample(70_000), sample(71_000), sample(72_000)];
    const [moment] = pressureMoments(history, events, "me");
    expect(moment.text).toBe("Your median pulse was 80 BPM.");
    expect(moment.context).toContain("3 valid");
    expect(moment.context).toContain("8.0s");
    expect(pressureMoments(history, events, "someone-else")).toEqual([]);
  });
  it("keeps decision feedback when physiology is unavailable and does not count duplicate windows", () => {
    const repeated = Array(10).fill(sample(70_000));
    expect(pressureMoments(repeated, events, "me")[0].text).toContain("8.0s");
    expect(pressureMoments([], events, "me")[0].context).toContain("Decision history remains available");
    expect(pressureMoments([], events.slice(0, 2), "me")).toEqual([]);
  });
});
