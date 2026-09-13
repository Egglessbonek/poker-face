/**
 * Fusion: TellSnapshot + BaselineStats -> TellVector.
 *
 * Two reads per decision, each a separate evidence line for the AIs:
 *
 * ON THE DECISION (`fuseTells`), from the window between being prompted and clicking:
 *   bluff ↑: fast action (Elwood: timing tells are the strongest class), freeze relative to the player's own
 *            decisions (Caro; Slepian et al. 2013), tension ↑, stared at the flop (Caro: missed it), looked back
 *            at their cards after a community card (Elwood: a draw)
 *   strength ↑: glance at the bet controls right after a card (Caro's chip glance, on a screen), leaned in when
 *            the card came (Caro: sudden interest), Duchenne smile leak (Ekman)
 *   Facial micro-cues are weak alone (DePaulo et al. 2003 meta-analysis), so each is capped.
 *
 * AFTER A BET (`fuseAfterAction`), from the seconds after the player's own bet or raise:
 *   bluff ↑: froze after betting, would not look up (Elwood: post-bet stillness and gaze avoidance), blink
 *            rebound (Leal & Vrij 2008: liars blink less during the lie and more right after)
 *   strength ↑: sat back (Elwood: post-bet relaxation), tension dropped, a genuine smile
 *
 * Camera and decision timing only: no cursor tracking, no microphone. Every rule emits an Evidence item with
 * human-readable text so villain talk, rail and reveal can all render it.
 */

import { decidingHeadMotion } from "./baseline";
import { DEFAULT_GAZE_REFERENCE, gazeZone } from "./gaze";
import type { BaselineStats, Evidence, TellSnapshot, TellVector } from "@/lib/types";

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

function combine(evidence: Evidence[], arousal: number, confidence: number, history: TellVector[]): TellVector {
  const bluffScore = evidence.filter((e) => e.direction === "bluff").reduce((a, e) => a + e.strength, 0);
  const strengthScore = evidence.filter((e) => e.direction === "strength").reduce((a, e) => a + e.strength, 0);
  const bluffLikelihood = clamp(0.5 + 0.2 * (bluffScore - strengthScore), 0.05, 0.95);
  let trend: TellVector["trend"] = "stable";
  if (history.length >= 2) {
    const prev = history[history.length - 1].arousal;
    if (arousal > prev + 5) trend = "rising";
    else if (arousal < prev - 5) trend = "falling";
  }
  return { arousal: Math.round(clamp(arousal, 0, 100)), bluffLikelihood, confidence, trend, evidence };
}

export function fuseTells(snapshot: TellSnapshot, baseline: BaselineStats | null, history: TellVector[] = []): TellVector {
  const evidence: Evidence[] = [];
  const frames = snapshot.frames.filter((f) => f.facePresent);
  const confidence = Math.min(1, frames.length / 8);

  if (!baseline || frames.length === 0) {
    return { arousal: 50, bluffLikelihood: 0.5, confidence: 0, trend: "stable", evidence };
  }

  const avg = (sel: (f: (typeof frames)[number]) => number) => frames.reduce((a, f) => a + sel(f), 0) / frames.length;

  // Blink rate ratio.
  const blinkRatio = avg((f) => f.blinkRate) / baseline.blinkRate;
  // Facial micro-signals are weak individually (DePaulo et al. 2003 meta-analysis): cap their weight.
  if (blinkRatio > 1.5) evidence.push({ signal: "blink_rate", direction: "bluff", strength: Math.min(0.6, (blinkRatio - 1) / 2), text: `blink rate ${blinkRatio.toFixed(1)}x baseline` });

  // Freeze: stiller than this player's own recent decisions. Freezing is one of the better-supported bluff
  // cues (Caro; Slepian et al. 2013 on motion smoothness), but only as a deviation from how the player usually
  // decides, so it needs one prior decision window and can never fire on the first decision.
  const usual = decidingHeadMotion(baseline);
  const motionRatio = usual === null ? 1 : avg((f) => f.headMotion) / usual;
  if (usual !== null && motionRatio < 0.4) evidence.push({ signal: "freeze", direction: "bluff", strength: Math.min(0.7, (0.4 - motionRatio) / 0.4), text: `went unusually still (${Math.round(motionRatio * 100)}% of usual motion)` });

  // Tension.
  const tensionDelta = avg((f) => f.tension) - baseline.tension;
  if (tensionDelta > 0.1) evidence.push({ signal: "tension", direction: "bluff", strength: Math.min(0.5, tensionDelta / 0.3), text: "jaw/brow tension up" });

  // Reactions to cards.
  for (const r of snapshot.cardRevealReactions) {
    if (r.smileLeak) evidence.push({ signal: "smile_leak", direction: "strength", strength: 0.7, text: `smile leak after the ${r.event}` });
    // Caro's chip glance: eyes go to the chips (here, the bet controls) right after good cards.
    if (r.controlsGlance) evidence.push({ signal: "controls_glance", direction: "strength", strength: 0.65, text: `eyed the bet controls right after the ${r.event}` });
    // Caro: players who miss the flop stare at it; players who hit it look away.
    if (r.boardStare) evidence.push({ signal: "board_stare", direction: "bluff", strength: 0.4, text: `stared at the ${r.event} for seconds` });
    // Elwood: looking back at hole cards after a community card usually means checking suits for a draw.
    if (r.cardRecheck) evidence.push({ signal: "card_recheck", direction: "bluff", strength: 0.3, text: `looked back at their cards after the ${r.event}` });
    // Caro: sudden interest, the lean toward the table, means strength.
    if (r.leanIn) evidence.push({ signal: "lean_in", direction: "strength", strength: 0.4, text: `leaned in when the ${r.event} came` });
  }

  // Decision latency.
  const latencyRatio = snapshot.decisionLatencyMs / baseline.decisionLatencyMs;
  // Timing tells are the strongest class in the literature (Elwood): weigh them above facial cues.
  if (latencyRatio < 0.5) evidence.push({ signal: "fast_action", direction: "bluff", strength: 0.6, text: "acted unusually fast" });
  if (latencyRatio > 2) evidence.push({ signal: "slow_action", direction: "neutral", strength: 0.3, text: "took a long time to act" });

  const arousal = 50 + clamp(20 * (blinkRatio - 1), -15, 25) + clamp(60 * tensionDelta, -20, 30) + (motionRatio < 0.4 ? 10 : 0);
  return combine(evidence, arousal, confidence, history);
}

/** Seconds after a bet or raise that the post-bet read covers. */
export const AFTER_ACTION_MS = 5000;

/**
 * The read taken in the seconds after the player's own bet or raise. A separate evidence line: it never replaces
 * the decision read, and it carries no timing rule (nothing was decided in this window).
 */
export function fuseAfterAction(snapshot: TellSnapshot, baseline: BaselineStats | null): TellVector {
  const evidence: Evidence[] = [];
  const frames = snapshot.frames.filter((f) => f.facePresent);
  const confidence = Math.min(1, frames.length / 8);
  if (!baseline || frames.length === 0) return { arousal: 50, bluffLikelihood: 0.5, confidence: 0, trend: "stable", evidence };
  const avg = (sel: (f: (typeof frames)[number]) => number) => frames.reduce((a, f) => a + sel(f), 0) / frames.length;

  // Elwood: bluffers go still after a big bet; value bettors relax.
  const usual = decidingHeadMotion(baseline);
  const motionRatio = usual === null ? 1 : avg((f) => f.headMotion) / usual;
  if (usual !== null && motionRatio < 0.4) evidence.push({ signal: "post_freeze", direction: "bluff", strength: 0.6, text: `after betting: froze (${Math.round(motionRatio * 100)}% of usual motion)` });

  // Elwood: after betting, bluffers avoid eye contact; on a screen that is never looking up toward the camera.
  const ref = baseline.gazeV !== undefined && baseline.gazeH !== undefined ? { gazeV: baseline.gazeV, gazeH: baseline.gazeH } : DEFAULT_GAZE_REFERENCE;
  const zones = frames.map((f) => gazeZone(f.gazeV, f.gazeH, ref)).filter((z) => z !== "unknown");
  if (zones.length >= 8) {
    const away = zones.filter((z) => z === "away").length / zones.length;
    const up = zones.filter((z) => z === "camera").length / zones.length;
    if (away > 0.5 && up === 0) evidence.push({ signal: "post_gaze_away", direction: "bluff", strength: 0.4, text: "after betting: looked away and never up" });
  }

  // Elwood: sitting back after a bet is relaxation; Caro: the frozen lean-in is the bluffer's posture.
  const dist = frames.map((f) => f.distance).filter((d): d is number => d !== undefined);
  if (baseline.distance && dist.length >= 4) {
    const d = dist.reduce((a, b) => a + b, 0) / dist.length / baseline.distance;
    if (d > 1.06) evidence.push({ signal: "post_lean_back", direction: "strength", strength: 0.45, text: "after betting: sat back" });
    else if (d < 0.94 && motionRatio < 0.6) evidence.push({ signal: "post_lean_in", direction: "bluff", strength: 0.3, text: "after betting: leaned in and held still" });
  }

  // Leal & Vrij 2008: blink rate rebounds right after a lie.
  const blinkRatio = avg((f) => f.blinkRate) / baseline.blinkRate;
  if (blinkRatio > 1.4) evidence.push({ signal: "post_blink_rebound", direction: "bluff", strength: 0.3, text: `after betting: blink rate ${blinkRatio.toFixed(1)}x baseline` });

  const tensionDelta = avg((f) => f.tension) - baseline.tension;
  if (tensionDelta < -0.05) evidence.push({ signal: "post_tension_drop", direction: "strength", strength: 0.3, text: "after betting: tension dropped" });
  if (frames.some((f) => f.duchenne)) evidence.push({ signal: "post_smile", direction: "strength", strength: 0.5, text: "after betting: a genuine smile" });

  const arousal = 50 + clamp(20 * (blinkRatio - 1), -15, 25) + clamp(60 * tensionDelta, -20, 30) + (motionRatio < 0.4 ? 10 : 0);
  return combine(evidence, arousal, confidence, []);
}

/** Compact text for ElevenLabs contextual updates and LLM prompts. */
export function describeTells(v: TellVector): string {
  const ev = v.evidence.map((e) => e.text).join("; ") || "no notable tells";
  return `arousal ${v.arousal}/100 (${v.trend}), bluff likelihood ${(v.bluffLikelihood * 100).toFixed(0)}%, confidence ${(v.confidence * 100).toFixed(0)}%. Evidence: ${ev}.`;
}
