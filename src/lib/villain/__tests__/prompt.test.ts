import { describe, expect, it } from "vitest";
import type { VillainDecisionInput } from "@/lib/types";
import type { Recommendation } from "@/lib/poker/strategy";
import { villainUserPrompt } from "../prompt";

describe("villainUserPrompt", () => {
  it("keeps exact equity and baseline calculations out of the model prompt", () => {
    const input: VillainDecisionInput = {
      hand: { handNumber: 4, street: "flop", board: ["2c", "7d", "Js"], pot: 24, currentBet: 8, minRaise: 8, actions: [] },
      me: { seat: 0, holeCards: ["As", "Kh"], stack: 192, committed: 8, position: "BTN" },
      opponents: [],
      names: { 0: "Claude" },
      legalActions: ["fold", "call", "raise"],
      bounds: { toCall: 8, minTotal: 16, maxTotal: 200 },
      equity: 0.73,
      potOdds: 0.31,
      bigBlind: 2,
      hasInitiative: true,
      raisesThisStreet: 0,
      modelId: "anthropic/claude-sonnet-4",
      recentTalk: [],
    };
    const recommendation: Recommendation = {
      action: "call",
      reason: "73% equity beats 31% pot odds",
      read: { name: "High Card", descr: "Ace high", category: "two overcards", strength: 0.2, draws: [], outs: 6 },
    };

    const prompt = villainUserPrompt(input, recommendation);

    expect(prompt).not.toContain("73%");
    expect(prompt).not.toContain("31%");
    expect(prompt).not.toContain("equity beats");
    expect(prompt).toContain("Private baseline strategy recommends: call");
  });
});
