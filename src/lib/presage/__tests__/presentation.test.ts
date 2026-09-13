import { describe, expect, it } from "vitest";
import { pressureStatus, rateStatus, warmupRemaining } from "../presentation";
import type { VitalsView } from "../types";
const view: VitalsView = { serverNow: 11_000, startedAt: 1000, available: true, sessionId: "test", status: "measuring", message: "Gathering measurements", latest: null, validation: { code: 0, hint: "Hold still and record." }, baseline: { pulse: null, breathing: null }, history: [], events: [] };
describe("pressure panel status", () => {
  it("distinguishes facial calibration from each metric's warm-up", () => {
    expect(warmupRemaining(view, "pulse")).toBe(2);
    expect(warmupRemaining(view, "breathing")).toBe(20);
    expect(rateStatus(undefined, 20, true)).toContain("20s");
    expect(rateStatus(undefined, 0, false)).toBe("Measurement paused");
  });
  it("does not hide capture failures behind an endless warming message", () => {
    const warmed = { ...view, serverNow: 45_000 };
    expect(warmupRemaining(warmed, "breathing")).toBe(0);
    expect(pressureStatus(warmed, true, null)).toBe("Camera connected. Presage has not returned an estimate yet.");
    expect(pressureStatus(view, true, "Camera upload is falling behind")).toBe("Camera upload is falling behind");
    expect(pressureStatus({ ...view, message: "Camera processing is catching up" }, true, null)).toContain("catching up");
    expect(pressureStatus({ ...view, validation: { code: 7, hint: "Include your chest" } }, true, null)).toBe("Include your chest");
  });
});
