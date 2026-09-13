import { describe, expect, it } from "vitest";
import { canRecover, createRecoveryBudget, MeasurementError } from "../recovery";

describe("automatic measurement recovery", () => {
  it("recovers network and worker failures without retrying configuration failures", () => {
    expect(canRecover(new TypeError("Network failed"))).toBe(true);
    expect(canRecover(new DOMException("Timed out", "TimeoutError"))).toBe(true);
    expect(canRecover(new MeasurementError("Worker disconnected", true))).toBe(true);
    expect(canRecover(new MeasurementError("Authentication failed", false))).toBe(false);
    expect(canRecover(new DOMException("Permission denied", "NotAllowedError"))).toBe(false);
  });
  it("backs off and caps restarts so it cannot continuously erase warm-up", () => {
    const nextDelay = createRecoveryBudget();
    expect(nextDelay(false, 0)).toBeNull();
    expect(nextDelay(true, 1000)).toBe(2000);
    expect(nextDelay(true, 4000)).toBe(5000);
    expect(nextDelay(true, 10_000)).toBeNull();
    expect(nextDelay(true, 64_000)).toBe(2000);
  });
});
