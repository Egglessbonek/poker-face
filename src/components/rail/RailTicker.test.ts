import { describe, expect, it } from "vitest";
import { tickerMessage } from "./RailTicker";

describe("tickerMessage", () => {
  it("preserves spacing for table events without a player", () => {
    expect(tickerMessage({ message: "Flop dealt: A♥ 7♣ 7♠" })).toBe("Flop dealt: A♥ 7♣ 7♠");
  });

  it("removes a duplicated player prefix", () => {
    expect(tickerMessage({ playerName: "Maya", message: "Maya bet 32" })).toBe("bet 32");
  });

  it("leaves messages without the prefix unchanged", () => {
    expect(tickerMessage({ playerName: "Maya", message: "Raises after the turn" })).toBe("Raises after the turn");
  });
});
