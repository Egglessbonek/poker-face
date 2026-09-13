import { describe, it, expect } from "vitest";
import { qualifyRate, refreshRate, referenceRate } from "../quality";
import { validateFrames } from "../protocol";
const started = 1_000_000;
const raw = { value: 80, confidence: 95, stable: true };
describe("Presage measurement validity", () => {
  it("preserves signal failure reasons when redacted readings are refreshed", () => {
    const now = started + 40_000;
    const lowConfidence = qualifyRate({ ...raw, confidence: 40 }, "pulse", started, now, 0);
    expect(lowConfidence.value).toBeNull();
    expect(refreshRate(lowConfidence, started, now + 500, 0).reason).toBe("confidence");
    expect(refreshRate(lowConfidence, started, now + 4000, 0).reason).toBe("stale");
    const good = qualifyRate(raw, "pulse", started, now, 0);
    expect(refreshRate(good, started, now + 500, 1)).toMatchObject({ value: null, reason: "tracking" });
    expect(qualifyRate({ ...raw, stable: false }, "pulse", started, now, 0).reason).toBe("unstable");
    expect(qualifyRate(undefined, "pulse", started, now, 0).reason).toBe("missing");
  });
  it("requires the complete metric window, stable capture and validation", () => {
    expect(qualifyRate(raw, "pulse", started, started + 11_999, 0).quality).toBe("warming");
    expect(qualifyRate(raw, "breathing", started, started + 29_999, 0).quality).toBe("warming");
    expect(qualifyRate(raw, "pulse", started, started + 12_000, 0).quality).toBe("usable");
    for (const code of [null, 1, 12]) expect(qualifyRate(raw, "pulse", started, started + 40_000, code).value).toBeNull();
    expect(qualifyRate({ ...raw, stable: false }, "pulse", started, started + 40_000, 0).value).toBeNull();
    expect(qualifyRate({ ...raw, confidence: 0 }, "pulse", started, started + 40_000, 0).value).toBeNull();
  });
  it("suppresses stale, missing, nonfinite and out-of-range pulse estimates", () => {
    const now = started + 40_000;
    for (const value of [0, 39, 111, NaN, Infinity]) expect(qualifyRate({ ...raw, value }, "pulse", started, now, 0).value).toBeNull();
    expect(qualifyRate(undefined, "pulse", started, now, 0).quality).toBe("unavailable");
    expect(qualifyRate({ ...raw, at: now - 4000 }, "pulse", started, now, 0).quality).toBe("unavailable");
    expect(qualifyRate({ ...raw, at: now + 4000 }, "pulse", started, now, 0).quality).toBe("unavailable");
  });
  it("uses only valid initial estimates for a descriptive personal reference", () => {
    const rates = Array.from({ length: 15 }, (_, i) => qualifyRate({ ...raw, value: 70 + i }, "pulse", started, started + 40_000 + i * 1000, 0));
    expect(referenceRate(rates.slice(0, 14))).toBeNull();
    expect(referenceRate([qualifyRate(raw, "pulse", started, started + 1, 0), ...rates])).toBe(77);
  });
});
function frame(at: number) { const bytes = new Uint8Array(16); const view = new DataView(bytes.buffer); view.setUint32(0, 4, true); view.setFloat64(4, at, true); bytes.set([255, 216, 255, 217], 12); return bytes; }
describe("camera transport", () => {
  it("accepts ordered timestamped frames and rejects replay, truncated and oversized uploads", () => {
    const now = 100_000;
    expect(validateFrames(frame(now), now - 1, now)).toEqual({ lastAt: now, count: 1 });
    expect(() => validateFrames(frame(now), now, now)).toThrow(/timestamp/);
    expect(() => validateFrames(frame(now - 11_000), 0, now)).toThrow(/timestamp/);
    expect(() => validateFrames(frame(now).subarray(0, 14), 0, now)).toThrow();
    expect(() => validateFrames(new Uint8Array(3 * 1024 * 1024), 0, now)).toThrow();
  });
});
