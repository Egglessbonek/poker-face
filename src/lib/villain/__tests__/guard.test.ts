import { describe, expect, it } from "vitest";
import type { OpponentView, TellVector } from "@/lib/types";
import { canonicalTells, leaksOwnCards } from "../guard";

describe("leaksOwnCards", () => {
  it("catches rank words, pocket pairs, suits and combos for cards not on the board", () => {
    expect(leaksOwnCards("Pocket kings, let's go.", ["Kd", "Kh"], [])).toBe(true);
    expect(leaksOwnCards("I've got an ace here.", ["As", "7d"], ["2c", "9h", "Jd"])).toBe(true);
    expect(leaksOwnCards("K♦ in the hole and I'm not going anywhere.", ["Kd", "3c"], [])).toBe(true);
    expect(leaksOwnCards("Ace of spades says call.", ["As", "3c"], [])).toBe(true);
    expect(leaksOwnCards("AKo is plenty here.", ["Ah", "Kd"], [])).toBe(true);
    expect(leaksOwnCards("Just 5-2 offsuit, folding.", ["5d", "2c"], [])).toBe(true);
    expect(leaksOwnCards("ace-king suited, all day", ["As", "Ks"], [])).toBe(true);
    expect(leaksOwnCards("Qc is mine", ["Qc", "9d"], [])).toBe(true);
  });

  it("allows public ranks, English words that look like cards, and ordinary talk", () => {
    expect(leaksOwnCards("That ace on the flop changes things.", ["As", "7d"], ["Ah", "9h", "Jd"])).toBe(false);
    expect(leaksOwnCards("As you can see, I'm patient.", ["As", "7d"], [])).toBe(false);
    expect(leaksOwnCards("Ah, a free card.", ["Ah", "7d"], [])).toBe(false);
    expect(leaksOwnCards("Let's see a flop.", ["Kd", "3c"], [])).toBe(false);
    expect(leaksOwnCards("You went awfully still there, Raghu.", ["9s", "9d"], [])).toBe(false);
    expect(leaksOwnCards("", ["9s", "9d"], [])).toBe(false);
  });
});

const tells = (evidence: Array<[string, string]>, bluffLikelihood = 0.59): TellVector => ({
  arousal: 68, bluffLikelihood, confidence: 1, trend: "rising",
  evidence: evidence.map(([signal, text]) => ({ signal, text, direction: "bluff", strength: 0.5 })),
});
const opp = (name: string, t: TellVector | null, kind: "human" | "ai" = "human", folded = false) => ({ name, kind, folded, tells: t } as unknown as OpponentView);

describe("canonicalTells", () => {
  const raghu = opp("Raghu", tells([["chip_glance", "glanced at chips after the flop"], ["fast_action", "acted unusually fast"]]));

  it("maps paraphrases to the recorded evidence, named after the player", () => {
    expect(canonicalTells(["that quick look at the chips"], [raghu])).toEqual(["Raghu: glanced at chips after the flop"]);
    expect(canonicalTells(["Raghu snap-called"], [raghu])).toEqual(["Raghu: acted unusually fast"]);
  });

  it("turns a pasted summary line into the overall read, and drops what the evidence never said", () => {
    expect(canonicalTells(["arousal 68/100 (rising), bluff likelihood 59%, confidence 100%"], [raghu])).toEqual(["Raghu: 59% bluff likelihood overall"]);
    expect(canonicalTells(["Raghu went unusually still"], [raghu])).toEqual([]);
    expect(canonicalTells(["Claude is tight"], [raghu, opp("Claude", null, "ai")])).toEqual([]);
  });

  it("never attributes a tell to a folded seat or an AI, and does not repeat", () => {
    const folded = opp("Sam", tells([["freeze", "went unusually still (20% of usual motion)"]]), "human", true);
    expect(canonicalTells(["Sam froze"], [raghu, folded])).toEqual([]);
    expect(canonicalTells(["chips", "chip glance"], [raghu])).toEqual(["Raghu: glanced at chips after the flop"]);
  });
});
