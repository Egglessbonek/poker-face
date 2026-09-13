import { afterEach, describe, expect, it, vi } from "vitest";
import type { VillainDecisionInput } from "@/lib/types";
import { completeJSON } from "@/lib/llm/provider";
import { publicSpeechContext, publicTableTalk } from "../speech";
import { safeTableTalk } from "../speechGuard";
import { decide } from "../brain";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/llm/provider", () => ({ completeJSON: vi.fn(), perSeatModels: () => true, llmAvailable: () => true }));

const input: VillainDecisionInput = {
  hand: { handNumber: 1, street: "preflop", board: [], pot: 3, currentBet: 2, minRaise: 2, actions: [] },
  me: { seat: 0, holeCards: ["As", "Ad"], stack: 199, committed: 1, position: "BTN/SB" },
  opponents: [], names: {}, legalActions: ["fold", "call", "raise", "allin"],
  bounds: { toCall: 1, minTotal: 4, maxTotal: 200 }, equity: 0.85123456, potOdds: 0.25,
  bigBlind: 2, hasInitiative: false, raisesThisStreet: 0, modelId: "anthropic/claude-sonnet-5",
  recentTalk: ["My pocket aces are strong.", "That pause deserves its own soundtrack."],
};
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe("public speech gate", () => {
  it.each([
    "I've got top pair.", "Just a flush draw.", "My equity is 85%.", "Pocket rockets!",
    "My ace matches that ace on the board.", "I folded kings.", "Sam has the nuts.",
    "You should fold.", "If you raise, I'll call.", "Let's team up.", "I have nothing.",
    "I am strong here.", "Only A-K.", "A♠ and K♦.", "<speak>aces</speak>", "I hold a\u200bces.",
    "My ＡＫ says hello.", "Eighty percent equity.", "No bluff this time.",
  ])("rejects disclosures, advice and conflicting action speech: %s", (text) => {
    expect(safeTableTalk(text)).toBe("");
  });
  it.each(["That pause deserves its own soundtrack.", "A very dramatic silence.", "Quite the poker face."])("preserves ordinary banter: %s", (text) => {
    expect(safeTableTalk(text)).toBe(text);
  });
});

describe("speech isolation", () => {
  it("uses the same public context even if private cards, equity, names or notebook change", () => {
    const modified: VillainDecisionInput = { ...input, me: { ...input.me, holeCards: ["2c", "7d"] }, equity: 0.1, names: { 0: "PRIVATE_SENTINEL" }, notes: [{ handNumber: 1, street: "flop", playerId: "other", name: "Other", action: "bet", held: "PRIVATE_SENTINEL", bluff: false, equity: 0.9, responses: [], won: true }] };
    expect(publicSpeechContext(input, "call")).toEqual(publicSpeechContext(modified, "call"));
    const context = JSON.stringify(publicSpeechContext(input, "call"));
    expect(context).toContain('"chosenAction":"call"');
    expect(context).not.toMatch(/As|Ad|0\.85123456|pocket aces|PRIVATE_SENTINEL/);
  });

  it("ignores speech from the private decision, using only the separate public completion", async () => {
    vi.mocked(completeJSON)
      .mockResolvedValueOnce({ action: "call", reasoning: "PRIVATE: pocket aces", tableTalk: "I have aces.", tellsUsed: [] })
      .mockResolvedValueOnce({ text: "That pause was very long." });
    const result = await decide(input, Date.now() + 15000);
    expect(result.action).toBe("call");
    expect(result.tableTalk).toBe("That pause was very long.");
    const speechRequest = vi.mocked(completeJSON).mock.calls[1][0];
    expect(speechRequest.user).not.toMatch(/PRIVATE|pocket aces|As|Ad|0\.85123456/);
    expect(speechRequest.user).toContain('"chosenAction":"call"');
    expect(speechRequest.system).toContain("action you are about to take");
    expect(speechRequest.system).toContain("a little stupid");
  });

  it("replaces unsafe output with a safe action-aware line", async () => {
    vi.mocked(completeJSON).mockResolvedValue({ text: "Top pair is plenty." });
    expect(await publicTableTalk(input, "fold")).toBe("Nope. Those chips can stay there.");
  });

  it("bounds the speech delay and preserves a completed poker decision when speech stalls", async () => {
    vi.useFakeTimers();
    vi.mocked(completeJSON)
      .mockResolvedValueOnce({ action: "call", reasoning: "private", tellsUsed: [] })
      .mockImplementationOnce(() => new Promise(() => {}));
    const pending = decide(input, Date.now() + 15000);
    await vi.advanceTimersByTimeAsync(4000);
    const result = await pending;
    expect(result.action).toBe("call");
    expect(result.llmUsed).toBe(true);
    expect(result.tableTalk).toBe("Okay. This seems reasonable enough.");
    expect(vi.getTimerCount()).toBe(0);
    expect(vi.mocked(completeJSON).mock.calls[1][0].signal?.aborted).toBe(true);
  });
});
