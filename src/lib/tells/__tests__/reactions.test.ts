import { describe, expect, it } from "vitest";
import type { BaselineStats, TellFrame } from "@/lib/types";
import { gazeZone } from "../gaze";
import { reactionFor } from "../reactions";
import { fuseAfterAction } from "../fuse";
import { computeBaseline, updateBaselineAfterDecision } from "../baseline";

const frame = (t: number, over: Partial<TellFrame> = {}): TellFrame => ({
  t, facePresent: true, confidence: 1, blinkRate: 15, gaze: "board", gazeV: 0.25, gazeH: 0, distance: 30, headMotion: 0.002, tension: 0.1, smile: 0.05, duchenne: false,
  emotion: { neutral: 1, happy: 0, surprise: 0, fear: 0, anger: 0, disgust: 0, sad: 0 }, fakeSmile: false, ...over,
});
/** Frames every 250ms from `from` to `to` (inclusive), with per-frame overrides by time. */
const span = (from: number, to: number, over: (t: number) => Partial<TellFrame> = () => ({})) => {
  const out: TellFrame[] = [];
  for (let t = from; t <= to; t += 250) out.push(frame(t, over(t)));
  return out;
};
const base: BaselineStats = { blinkRate: 15, headMotion: 0.002, tension: 0.1, smile: 0.05, decisionLatencyMs: 4000, gazeV: 0.25, gazeH: 0, distance: 30, calibratedAt: 0 };

describe("gazeZone", () => {
  it("is relative to the player's reference, not absolute", () => {
    expect(gazeZone(0.25, 0, { gazeV: 0.25, gazeH: 0 })).toBe("board");
    expect(gazeZone(0.6, 0, { gazeV: 0.25, gazeH: 0 })).toBe("cards");
    expect(gazeZone(0.6, 0, { gazeV: 0.6, gazeH: 0 })).toBe("board");
    expect(gazeZone(0.0, 0, { gazeV: 0.25, gazeH: 0 })).toBe("camera");
    expect(gazeZone(0.25, 0.6, { gazeV: 0.25, gazeH: 0 })).toBe("away");
    expect(gazeZone(undefined, 0)).toBe("unknown");
  });
});

describe("reactionFor", () => {
  const T0 = 1_000_000;

  it("sees the chip glance: eyes drop to the controls right after the card, from somewhere else", () => {
    const buf = [...span(T0 - 1500, T0 - 250), ...span(T0, T0 + 3000, (t) => (t >= T0 + 250 && t <= T0 + 1000 ? { gazeV: 0.7 } : {}))];
    const r = reactionFor({ event: "flop", t: T0 }, buf, base);
    expect(r.controlsGlance).toBe(true);
    expect(r.boardStare).toBe(false);
  });

  it("does not call it a glance when the player was already looking down before the card", () => {
    const buf = [...span(T0 - 1500, T0 - 250, () => ({ gazeV: 0.7 })), ...span(T0, T0 + 3000, () => ({ gazeV: 0.7 }))];
    expect(reactionFor({ event: "flop", t: T0 }, buf, base).controlsGlance).toBe(false);
  });

  it("sees a stare: eyes stay on the board for seconds after a community card, never after hole cards", () => {
    const buf = [...span(T0 - 1500, T0 - 250), ...span(T0, T0 + 3000)];
    expect(reactionFor({ event: "flop", t: T0 }, buf, base).boardStare).toBe(true);
    expect(reactionFor({ event: "hole", t: T0 }, buf, base).boardStare).toBe(false);
    const brief = [...span(T0 - 1500, T0 - 250), ...span(T0, T0 + 3000, (t) => (t > T0 + 1000 ? { gazeV: 0.7 } : {}))];
    expect(reactionFor({ event: "flop", t: T0 }, brief, base).boardStare).toBe(false);
  });

  it("sees a re-check: a look back at the cards a beat after the flop", () => {
    const buf = [...span(T0 - 1500, T0 - 250), ...span(T0, T0 + 3000, (t) => (t >= T0 + 1500 && t <= T0 + 2250 ? { gazeV: 0.7 } : {}))];
    expect(reactionFor({ event: "turn", t: T0 }, buf, base).cardRecheck).toBe(true);
  });

  it("sees a lean in: the face gets closer when the card lands", () => {
    const buf = [...span(T0 - 1500, T0 - 250, () => ({ distance: 30 })), ...span(T0, T0 + 3000, () => ({ distance: 27 }))];
    expect(reactionFor({ event: "river", t: T0 }, buf, base).leanIn).toBe(true);
    const steady = [...span(T0 - 1500, T0 - 250, () => ({ distance: 30 })), ...span(T0, T0 + 3000, () => ({ distance: 30 }))];
    expect(reactionFor({ event: "river", t: T0 }, steady, base).leanIn).toBe(false);
  });

  it("falls back to the default gaze reference without a calibration", () => {
    const buf = [...span(T0 - 1500, T0 - 250), ...span(T0, T0 + 3000)];
    expect(reactionFor({ event: "flop", t: T0 }, buf, null).boardStare).toBe(true);
  });
});

describe("fuseAfterAction", () => {
  const T0 = 1_000_000;
  const snap = (frames: TellFrame[]) => ({ handNumber: 1, street: "flop" as const, decisionLatencyMs: 4000, frames, cardRevealReactions: [] });
  // A baseline with three decisions of ordinary motion behind it, so "froze" has a reference.
  const withDecisions = () => {
    let b = computeBaseline(span(T0 - 20000, T0 - 10000));
    for (let i = 0; i < 3; i++) b = updateBaselineAfterDecision(b, snap(span(T0, T0 + 3000, () => ({ headMotion: 0.002 }))), 4000);
    return b;
  };
  const signals = (frames: TellFrame[], b = withDecisions()) => fuseAfterAction(snap(frames), b).evidence.map((e) => e.signal);

  it("reads a frozen, looking-away bettor as a bluff and a relaxed one as strength", () => {
    const frozen = span(T0, T0 + 5000, () => ({ headMotion: 0.0003, gazeV: 0.25, gazeH: 0.8 }));
    const s = signals(frozen);
    expect(s).toContain("post_freeze");
    expect(s).toContain("post_gaze_away");
    expect(fuseAfterAction(snap(frozen), withDecisions()).bluffLikelihood).toBeGreaterThan(0.6);
    const relaxed = span(T0, T0 + 5000, () => ({ headMotion: 0.003, distance: 33, tension: 0.02, duchenne: true }));
    const r = signals(relaxed);
    expect(r).toEqual(expect.arrayContaining(["post_lean_back", "post_tension_drop", "post_smile"]));
    expect(fuseAfterAction(snap(relaxed), withDecisions()).bluffLikelihood).toBeLessThan(0.4);
  });

  it("never emits a timing tell and prefixes every line with 'after betting'", () => {
    const v = fuseAfterAction(snap(span(T0, T0 + 5000, () => ({ blinkRate: 30 }))), withDecisions());
    expect(v.evidence.map((e) => e.signal)).toEqual(["post_blink_rebound"]);
    expect(v.evidence.every((e) => e.text.startsWith("after betting: "))).toBe(true);
  });

  it("has no confidence without a baseline or frames", () => {
    expect(fuseAfterAction(snap([]), withDecisions()).confidence).toBe(0);
    expect(fuseAfterAction(snap(span(T0, T0 + 2000)), null).confidence).toBe(0);
  });
});
