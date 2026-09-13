import { describe, expect, it } from "vitest";
import type { OpponentView, TellVector } from "@/lib/types";
import { canonicalTells, leaksOwnCards, leaksPrivateMetrics } from "../guard";

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

describe("leaksPrivateMetrics", () => {
  it("blocks private calculations from spoken table talk", () => {
    expect(leaksPrivateMetrics("I have 72% equity here.")).toBe(true);
    expect(leaksPrivateMetrics("Seventy percent says this is a call.")).toBe(true);
    expect(leaksPrivateMetrics("The pot odds are too good to fold.")).toBe(true);
    expect(leaksPrivateMetrics("My chance to win is excellent.")).toBe(true);
    expect(leaksPrivateMetrics("Your bluff likelihood just spiked.")).toBe(true);
  });

  it("allows ordinary poker banter and qualitative tell references", () => {
    expect(leaksPrivateMetrics("That blink came right on the bet, Maya.")).toBe(false);
    expect(leaksPrivateMetrics("I like my hand enough to call.")).toBe(false);
    expect(leaksPrivateMetrics("Against the odds, you might be telling the truth.")).toBe(false);
  });
});

const tells = (evidence: Array<[string, string]>, bluffLikelihood = 0.59): TellVector => ({
  arousal: 68, bluffLikelihood, confidence: 1, trend: "rising",
  evidence: evidence.map(([signal, text]) => ({ signal, text, direction: "bluff", strength: 0.5 })),
});
const opp = (name: string, t: TellVector | null, kind: "human" | "ai" = "human", folded = false) => ({ name, kind, folded, tells: t } as unknown as OpponentView);

describe("canonicalTells", () => {
  const raghu = opp("Raghu", tells([["controls_glance", "eyed the bet controls right after the flop"], ["fast_action", "acted unusually fast"]]));

  it("maps paraphrases to the recorded evidence, named after the player", () => {
    expect(canonicalTells(["that quick look at the chips"], [raghu])).toEqual(["Raghu: eyed the bet controls right after the flop"]);
    expect(canonicalTells(["Raghu snap-called"], [raghu])).toEqual(["Raghu: acted unusually fast"]);
  });

  it("turns a pasted summary line into the overall read, and drops what the evidence never said", () => {
    expect(canonicalTells(["arousal 68/100 (rising), bluff likelihood 59%, confidence 100%"], [raghu])).toEqual(["Raghu: 59% bluff likelihood overall"]);
    expect(canonicalTells(["Raghu went unusually still"], [raghu])).toEqual([]);
    expect(canonicalTells(["Claude is tight"], [raghu, opp("Claude", null, "ai")])).toEqual([]);
  });

  it("does not turn a neutral low-confidence read into a cited tell", () => {
    expect(canonicalTells(["Raghu looks bluffish"], [opp("Raghu", { ...tells([], 0.5), confidence: 0.2 })])).toEqual([]);
  });

  it("never attributes a tell to a folded seat or an AI, and does not repeat", () => {
    const folded = opp("Sam", tells([["freeze", "went unusually still (20% of usual motion)"]]), "human", true);
    expect(canonicalTells(["Sam froze"], [raghu, folded])).toEqual([]);
    expect(canonicalTells(["chips", "chip glance"], [raghu])).toEqual(["Raghu: eyed the bet controls right after the flop"]);
  });
});

describe("canonicalTells with a post-bet line", () => {
  const both = { ...opp("Raghu", tells([["freeze", "went unusually still (30% of usual motion)"]])), after: tells([["post_freeze", "after betting: froze (20% of usual motion)"], ["post_gaze_away", "after betting: looked away and never up"]]) } as unknown as OpponentView;

  it("maps a line about the bet's aftermath to the post-bet evidence, and a plain line to the decision read", () => {
    expect(canonicalTells(["Raghu froze after that bet"], [both])).toEqual(["Raghu: after betting: froze (20% of usual motion)"]);
    expect(canonicalTells(["Raghu went still"], [both])).toEqual(["Raghu: went unusually still (30% of usual motion)"]);
    expect(canonicalTells(["would not look at me after betting"], [both])).toEqual(["Raghu: after betting: looked away and never up"]);
  });

  it("finds post-bet-only evidence when the decision read has none of that signal", () => {
    const onlyAfter = { ...opp("Raghu", tells([])), after: tells([["post_lean_back", "after betting: sat back"]]) } as unknown as OpponentView;
    expect(canonicalTells(["Raghu relaxed"], [onlyAfter])).toEqual(["Raghu: after betting: sat back"]);
  });
});
