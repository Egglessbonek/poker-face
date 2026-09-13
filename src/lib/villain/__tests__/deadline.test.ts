import { afterEach, describe, expect, it, vi } from "vitest";
import type { VillainDecisionInput } from "@/lib/types";
import { completeJSON } from "@/lib/llm/provider";
import { decide } from "../brain";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/llm/provider", () => ({ completeJSON: vi.fn(), llmAvailable: () => true, perSeatModels: () => true }));

const input: VillainDecisionInput = {
  hand: { handNumber: 1, street: "preflop", board: [], pot: 3, currentBet: 2, minRaise: 2, actions: [] },
  me: { seat: 0, holeCards: ["As", "Ad"], stack: 199, committed: 1, position: "BTN/SB" },
  opponents: [], names: {}, legalActions: ["fold", "call", "raise", "allin"],
  bounds: { toCall: 1, minTotal: 4, maxTotal: 200 },
  equity: 0.85, potOdds: 0.25, bigBlind: 2, hasInitiative: false, raisesThisStreet: 0,
  modelId: "anthropic/claude-sonnet-5", recentTalk: [],
};

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.clearAllMocks(); });

describe("AI turn deadline", () => {
  it("plays a legal strategy action when a provider never answers, and ignores its late answer", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    let answer!: (value: unknown) => void;
    vi.mocked(completeJSON)
      .mockImplementationOnce(() => new Promise((resolve) => { answer = resolve; }));
    const pending = decide(input, Date.now() + 1500);
    await vi.advanceTimersByTimeAsync(1500);
    const result = await pending;
    expect(result.llmUsed).toBe(false);
    expect(result.action).toBe("raise");
    answer({ action: "fold", reasoning: "late", tableTalk: "", tellsUsed: [] });
    await Promise.resolve();
    expect(result.action).toBe("raise");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses an on-time model answer and clears its deadline timer", async () => {
    vi.useFakeTimers();
    vi.mocked(completeJSON).mockResolvedValue({ action: "call", reasoning: "mix", tableTalk: "", tellsUsed: [] });
    const result = await decide(input, Date.now() + 1500);
    expect(result.action).toBe("call");
    expect(result.llmUsed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not request a model after the turn has expired", async () => {
    expect((await decide(input, Date.now() - 1)).llmUsed).toBe(false);
    expect(completeJSON).not.toHaveBeenCalled();
  });
});
