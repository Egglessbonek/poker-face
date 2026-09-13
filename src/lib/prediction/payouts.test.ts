import { describe, expect, it } from "vitest";
import { pariMutuelPayouts } from "./payouts";

describe("pariMutuelPayouts", () => {
  it("splits the post-fee pool in proportion to each winning stake", () => {
    expect(pariMutuelPayouts(4_000_000, [1_000_000, 2_000_000], 500)).toEqual([1_266_666, 2_533_333]);
  });

  it("returns no payouts when nobody backed the winner", () => {
    expect(pariMutuelPayouts(3_000_000, [], 500)).toEqual([]);
  });

  it("never distributes more than the pool after fees", () => {
    const payouts = pariMutuelPayouts(10_000_003, [1, 1, 1], 500);
    expect(payouts.reduce((sum, payout) => sum + payout, 0)).toBeLessThanOrEqual(Math.floor(10_000_003 * 0.95));
  });
});
