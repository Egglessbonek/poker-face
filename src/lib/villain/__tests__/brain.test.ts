import { describe, expect, it, vi } from "vitest";
import type { OpponentView, TellVector, VillainDecisionInput } from "@/lib/types";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/llm/provider", () => ({ completeJSON: vi.fn(), llmAvailable: () => false, perSeatModels: () => ({}) }));

const tells = (bluffLikelihood: number, confidence: number): TellVector => ({ arousal: 50, bluffLikelihood, confidence, trend: "stable", evidence: [] });
const opp = (t: TellVector | null, folded = false) => ({ folded, tells: t } as unknown as OpponentView);
const input = (opponents: OpponentView[]) => ({ opponents } as unknown as VillainDecisionInput);

describe("tellAdjustment", () => {
  it("is zero without tells, for folded opponents, and for a neutral read at any confidence", async () => {
    const { tellAdjustment } = await import("../brain");
    expect(tellAdjustment(input([opp(null)]))).toBe(0);
    expect(tellAdjustment(input([opp(tells(0.9, 1), true)]))).toBe(0);
    expect(tellAdjustment(input([opp(tells(0.5, 0.3))]))).toBe(0);
  });

  it("shrinks a low-confidence read toward zero instead of toward 'opponent is strong'", async () => {
    const { tellAdjustment } = await import("../brain");
    const full = tellAdjustment(input([opp(tells(0.62, 1))]));
    const half = tellAdjustment(input([opp(tells(0.62, 0.5))]));
    expect(full).toBeGreaterThan(0);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeCloseTo(full / 2, 6);
  });

  it("stays within -0.2 .. +0.2 and averages across live opponents", async () => {
    const { tellAdjustment } = await import("../brain");
    expect(tellAdjustment(input([opp(tells(1, 1))]))).toBeCloseTo(0.2, 6);
    expect(tellAdjustment(input([opp(tells(0, 1))]))).toBeCloseTo(-0.2, 6);
    expect(tellAdjustment(input([opp(tells(1, 1)), opp(tells(0.5, 1))]))).toBeCloseTo(0.1, 6);
  });
});
