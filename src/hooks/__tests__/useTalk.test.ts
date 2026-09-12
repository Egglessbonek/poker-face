import { describe, expect, it } from "vitest";
import { EARLIER_HAND_GRACE_MS, STALE_MS, freshLines, type QueuedLine } from "../useTalk";

const line = (id: number, handNumber: number, receivedAt: number): QueuedLine => ({ event: { id, playerId: `p${id}`, text: `line ${id}`, handNumber, at: receivedAt }, receivedAt });

describe("freshLines", () => {
  it("drops a line older than the stale cap", () => {
    const now = 100_000;
    const q = [line(1, 3, now - STALE_MS - 1), line(2, 3, now - 1000)];
    expect(freshLines(q, now).map((l) => l.event.id)).toEqual([2]);
  });

  it("keeps a fresh line from the previous hand so both seats are heard at a hand's end", () => {
    const now = 100_000;
    const q = [line(1, 3, now - 2000), line(2, 4, now - 100)];
    expect(freshLines(q, now).map((l) => l.event.id)).toEqual([1, 2]);
  });

  it("drops an earlier-hand line once it has waited past the grace period", () => {
    const now = 100_000;
    const q = [line(1, 3, now - EARLIER_HAND_GRACE_MS - 1), line(2, 4, now - 100)];
    expect(freshLines(q, now).map((l) => l.event.id)).toEqual([2]);
  });
});
