import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HallEntry } from "@/lib/types";

// hall.ts imports "server-only", which throws outside a React Server Components runtime.
vi.mock("server-only", () => ({}));

type Hall = typeof import("@/lib/hall");
let hall: Hall;

const entry = (over: Partial<HallEntry>): HallEntry => ({
  name: "Maya",
  code: "KXTR",
  pokerFace: 50,
  bluffs: 0,
  bluffsCaught: 0,
  readsRight: 0,
  readsTotal: 0,
  at: 0,
  ...over,
});

describe("hall of poker faces", () => {
  beforeEach(async () => {
    // The store lives on globalThis; start each test from an empty hall.
    delete (globalThis as { __hall?: unknown }).__hall;
    vi.resetModules();
    hall = await import("@/lib/hall");
  });

  it("starts empty", () => {
    expect(hall.getHall()).toEqual([]);
  });

  it("ranks by poker face, most recent first on ties", () => {
    hall.recordHall([entry({ name: "Old", pokerFace: 80, at: 1 }), entry({ name: "Low", pokerFace: 20, at: 3 })]);
    hall.recordHall([entry({ name: "New", pokerFace: 80, at: 2 })]);
    expect(hall.getHall().map((e) => e.name)).toEqual(["New", "Old", "Low"]);
  });

  it("honours the limit and defaults to ten", () => {
    hall.recordHall(Array.from({ length: 12 }, (_, i) => entry({ name: `P${i}`, pokerFace: i, at: i })));
    expect(hall.getHall(2).map((e) => e.pokerFace)).toEqual([11, 10]);
    expect(hall.getHall()).toHaveLength(10);
  });

  it("keeps at most 200 entries, dropping the oldest", () => {
    hall.recordHall(Array.from({ length: 150 }, (_, i) => entry({ name: `A${i}`, pokerFace: 1, at: i })));
    hall.recordHall(Array.from({ length: 100 }, (_, i) => entry({ name: `B${i}`, pokerFace: 1, at: 1000 + i })));
    const all = hall.getHall(1000);
    expect(all).toHaveLength(200);
    expect(all.filter((e) => e.name.startsWith("B"))).toHaveLength(100);
    const survivors = all.filter((e) => e.name.startsWith("A"));
    expect(survivors).toHaveLength(100);
    expect(survivors.every((e) => e.at >= 50)).toBe(true);
  });

  it("ranks a match result among every face read so far", () => {
    hall.recordHall([entry({ name: "Maya", code: "KXTR", pokerFace: 80, at: 1 }), entry({ name: "Sam", code: "KXTR", pokerFace: 40, at: 1 })]);
    hall.recordHall([entry({ name: "Ira", code: "QQPL", pokerFace: 60, at: 2 })]);
    expect(hall.hallRank("KXTR", "Maya")).toEqual({ rank: 1, of: 3 });
    expect(hall.hallRank("QQPL", "Ira")).toEqual({ rank: 2, of: 3 });
    expect(hall.hallRank("KXTR", "Sam")).toEqual({ rank: 3, of: 3 });
    expect(hall.hallRank("KXTR", "Nobody")).toBeNull();
    expect(hall.hallRank("ZZZZ", "Maya")).toBeNull();
  });

  it("does not expose its internal array", () => {
    hall.recordHall([entry({ pokerFace: 1 })]);
    hall.getHall().length = 0;
    expect(hall.getHall()).toHaveLength(1);
  });
});
