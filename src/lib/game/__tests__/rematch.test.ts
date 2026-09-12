import { describe, expect, it } from "vitest";
import type { Player } from "@/lib/types";
import { aiGuestList } from "../rematch";

const player = (seat: number, kind: Player["kind"], modelId?: string): Player => ({ id: `${kind}-${seat}`, seat, name: `Seat ${seat}`, kind, modelId, stack: 200, connected: true, sittingOut: false });

describe("aiGuestList", () => {
  it("lists AI model ids in seat order and skips humans", () => {
    const players = [player(0, "human"), player(2, "ai", "openai/gpt-5.6-terra"), player(1, "ai", "anthropic/claude-sonnet-5"), player(3, "human")];
    expect(aiGuestList(players)).toEqual(["anthropic/claude-sonnet-5", "openai/gpt-5.6-terra"]);
  });
  it("preserves duplicate models", () => {
    const players = [player(0, "human"), player(1, "ai", "anthropic/claude-sonnet-5"), player(2, "ai", "anthropic/claude-sonnet-5")];
    expect(aiGuestList(players)).toEqual(["anthropic/claude-sonnet-5", "anthropic/claude-sonnet-5"]);
  });
  it("is empty for an all-human table", () => {
    expect(aiGuestList([player(0, "human"), player(1, "human")])).toEqual([]);
  });
});
