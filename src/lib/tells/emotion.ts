/**
 * Rule-based emotion (sentiment) estimate from the 52 ARKit-style blendshapes.
 * Explainable and dependency-free. Stretch: second opinion from an LLM vision snapshot.
 *
 * TODO(phase 2): tune thresholds against real faces; add hysteresis.
 */

import type { Emotion } from "@/lib/types";

export function emotionFromBlendshapes(bs: Record<string, number>): Record<Emotion, number> {
  const g = (k: string) => bs[k] ?? 0;
  const avg = (...ks: string[]) => ks.reduce((a, k) => a + g(k), 0) / ks.length;

  const raw: Record<Emotion, number> = {
    happy: avg("mouthSmileLeft", "mouthSmileRight") * 0.7 + avg("cheekSquintLeft", "cheekSquintRight") * 0.3,
    surprise: avg("browInnerUp", "browOuterUpLeft", "browOuterUpRight") * 0.5 + g("jawOpen") * 0.3 + avg("eyeWideLeft", "eyeWideRight") * 0.2,
    fear: avg("eyeWideLeft", "eyeWideRight") * 0.4 + g("browInnerUp") * 0.3 + avg("mouthStretchLeft", "mouthStretchRight") * 0.3,
    anger: avg("browDownLeft", "browDownRight") * 0.5 + g("jawForward") * 0.2 + avg("mouthPressLeft", "mouthPressRight") * 0.3,
    disgust: avg("noseSneerLeft", "noseSneerRight") * 0.6 + g("mouthUpperUpLeft") * 0.2 + g("mouthUpperUpRight") * 0.2,
    sad: avg("mouthFrownLeft", "mouthFrownRight") * 0.5 + g("browInnerUp") * 0.3 + avg("mouthLowerDownLeft", "mouthLowerDownRight") * 0.2,
    neutral: 0,
  };

  const sum = Object.values(raw).reduce((a, b) => a + b, 0);
  raw.neutral = Math.max(0, 1 - sum);
  const total = sum + raw.neutral || 1;
  for (const k of Object.keys(raw) as Emotion[]) raw[k] = raw[k] / total;
  return raw;
}

export function dominantEmotion(e: Record<Emotion, number>): Emotion {
  return (Object.entries(e) as Array<[Emotion, number]>).sort((a, b) => b[1] - a[1])[0][0];
}
