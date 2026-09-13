import { describe, expect, it } from "vitest";
import { createMetricSampler } from "../../../../scripts/presage-metrics.mjs";
import { qualifyRate } from "../quality";

describe("independent SDK rate updates", () => {
  it("keeps pulse updates received between UI deliveries and preserves their age", () => {
    const sample = createMetricSampler();
    const started = 1_000_000, now = started + 40_000;
    const breathing = { value: 14, confidence: 90, stable: true, timestamp: now * 1000 };
    const pulse = { value: 80, confidence: 95, stable: true, timestamp: (now + 200) * 1000 };
    sample({ breathing: { rate: [breathing] } }, now * 1000, now);
    expect(sample({ cardio: { pulseRate: [pulse] } }, pulse.timestamp, now + 200)).toBeNull();
    const next = sample({ breathing: { rate: [{ ...breathing, timestamp: (now + 1000) * 1000 }] } }, (now + 1000) * 1000, now + 1000)!;
    expect(next.pulse?.value).toBe(80);
    expect(next.breathing?.value).toBe(14);
    expect(next.pulse?.at).toBe(now + 200);
    expect(qualifyRate(next.pulse, "pulse", started, now + 1000, 0).quality).toBe("usable");
    const stale = sample({ breathing: { rate: [] } }, (now + 4000) * 1000, now + 4000)!;
    expect(qualifyRate(stale.pulse, "pulse", started, now + 4000, 0).quality).toBe("unavailable");
    expect(createMetricSampler()({}, (now + 5000) * 1000, now + 5000)?.pulse).toBeUndefined();
  });
  it("replaces a good estimate when the SDK reports poor quality", () => {
    const sample = createMetricSampler();
    sample({ cardio: { pulseRate: [{ value: 80, confidence: 95, stable: true, timestamp: 40_000_000 }] } }, 40_000_000, 40_000);
    const next = sample({ cardio: { pulseRate: [{ value: 80, confidence: 20, stable: false, timestamp: 41_000_000 }] } }, 41_000_000, 41_000)!;
    expect(qualifyRate(next.pulse, "pulse", 0, 41_000, 0).value).toBeNull();
  });
});
