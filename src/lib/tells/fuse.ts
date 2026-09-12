/**
 * Fusion: TellSnapshot + BaselineStats -> TellVector.
 *
 * Rules from the poker-tells literature (Caro; Elwood "Reading Poker Tells" / "Verbal Poker Tells";
 * DePaulo et al. 2003; Slepian et al. 2013):
 *   bluff ↑: fast bet, freeze, tension ↑, blink ↑, gaze away, silence, cursor hesitation, fake smile
 *   strength ↑: relaxed, chip glance after card reveal, Duchenne leak, talkative, smooth cursor
 *
 * Every rule emits an Evidence item with human-readable text so villain talk, rail and reveal can all render it.
 *
 * TODO(phase 3): weights, confidence from frame count/face presence, trend from history.
 */

import type { BaselineStats, Evidence, TellSnapshot, TellVector } from "@/lib/types";

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
  if (blinkRatio > 1.5) evidence.push({ signal: "blink_rate", direction: "bluff", strength: Math.min(1, (blinkRatio - 1) / 1.5), text: `blink rate ${blinkRatio.toFixed(1)}x baseline` });

  // Freeze.
  const motionRatio = avg((f) => f.headMotion) / baseline.headMotion;
  if (motionRatio < 0.4) evidence.push({ signal: "freeze", direction: "bluff", strength: Math.min(1, (0.4 - motionRatio) / 0.4), text: "went unusually still" });

  // Tension.
  const tensionDelta = avg((f) => f.tension) - baseline.tension;
  if (tensionDelta > 0.1) evidence.push({ signal: "tension", direction: "bluff", strength: Math.min(1, tensionDelta / 0.3), text: "jaw/brow tension up" });

  // Smile leaks after card reveals.
  for (const r of snapshot.cardRevealReactions) {
    if (r.smileLeak) evidence.push({ signal: "smile_leak", direction: "strength", strength: 0.7, text: `smile leak after the ${r.event}` });
    if (r.chipGlance) evidence.push({ signal: "chip_glance", direction: "strength", strength: 0.5, text: `glanced at chips after the ${r.event}` });
  }

  // Decision latency.
  const latencyRatio = snapshot.decisionLatencyMs / baseline.decisionLatencyMs;
  if (latencyRatio < 0.5) evidence.push({ signal: "fast_action", direction: "bluff", strength: 0.4, text: "acted unusually fast" });
  if (latencyRatio > 2) evidence.push({ signal: "slow_action", direction: "neutral", strength: 0.3, text: "took a long time to act" });

  // Cursor.
  if (snapshot.cursor) {
    if (snapshot.cursor.hoverFoldMs > 800) evidence.push({ signal: "hover_fold", direction: "bluff", strength: 0.5, text: "hovered over Fold before betting" });
    if (snapshot.cursor.tortuosity > 2) evidence.push({ signal: "cursor_hesitation", direction: "bluff", strength: 0.3, text: "hesitant cursor path" });
  }

  // Voice.
  if (snapshot.voice?.spoke) evidence.push({ signal: "talkative", direction: "strength", strength: 0.3, text: "talked during the decision" });

  const bluffScore = evidence.filter((e) => e.direction === "bluff").reduce((a, e) => a + e.strength, 0);
  const strengthScore = evidence.filter((e) => e.direction === "strength").reduce((a, e) => a + e.strength, 0);
  const bluffLikelihood = clamp(0.5 + 0.2 * (bluffScore - strengthScore), 0.05, 0.95);
  const arousal = clamp(50 + clamp(20 * (blinkRatio - 1), -15, 25) + clamp(60 * tensionDelta, -20, 30) + (motionRatio < 0.4 ? 10 : 0), 0, 100);

  let trend: TellVector["trend"] = "stable";
  if (history.length >= 2) {
    const prev = history[history.length - 1].arousal;
    if (arousal > prev + 5) trend = "rising";
    else if (arousal < prev - 5) trend = "falling";
  }

  return { arousal: Math.round(arousal), bluffLikelihood, confidence, trend, evidence };
}

/** Compact text for ElevenLabs contextual updates and LLM prompts. */
export function describeTells(v: TellVector): string {
  const ev = v.evidence.map((e) => e.text).join("; ") || "no notable tells";
  return `arousal ${v.arousal}/100 (${v.trend}), bluff likelihood ${(v.bluffLikelihood * 100).toFixed(0)}%, confidence ${(v.confidence * 100).toFixed(0)}%. Evidence: ${ev}.`;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
