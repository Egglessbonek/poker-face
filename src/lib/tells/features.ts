/**
 * Per-frame feature extraction from FaceLandmarker output.
 *
 * TODO(phase 2):
 *  - blink detection: eyeBlinkLeft/Right > 0.5 edge-triggered, rolling 20s window -> blinks/min
 *  - gaze classification from eyeLook* blendshapes + head yaw/pitch (transformation matrix)
 *  - head motion variance over rolling 3s from the transformation matrix translation/rotation
 *  - tension composite: mean(browDownL/R, jawForward, mouthPressL/R, mouthPuckerL/R, noseSneerL/R)
 *  - smile & Duchenne (mouthSmile AND cheekSquint), fake smile (smile without squint)
 *  - EWMA smoothing on everything
 */

import type { FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import type { GazeTarget, TellFrame } from "@/lib/types";
import { blendshapeMap } from "./landmarker";
import { emotionFromBlendshapes } from "./emotion";

export interface FeatureExtractorState {
  blinkTimestamps: number[];
  /** First frame time; the blink window is scaled by elapsed time until 20s have passed. */
  startedAt?: number;
  eyesClosed: boolean;
  poseHistory: Array<{ t: number; x: number; y: number; z: number }>;
  ewma: Partial<Record<"tension" | "smile", number>>;
}

export function createFeatureState(): FeatureExtractorState {
  return { blinkTimestamps: [], eyesClosed: false, poseHistory: [], ewma: {} };
}

export function extractFrame(result: FaceLandmarkerResult, t: number, state: FeatureExtractorState): TellFrame {
  const facePresent = (result.faceLandmarks?.length ?? 0) > 0;
  const bs = blendshapeMap(result);

  // Blink edge detection.
  const blinkScore = Math.max(bs.eyeBlinkLeft ?? 0, bs.eyeBlinkRight ?? 0);
  if (!state.eyesClosed && blinkScore > 0.5) {
    state.eyesClosed = true;
    state.blinkTimestamps.push(t);
  } else if (state.eyesClosed && blinkScore < 0.3) {
    state.eyesClosed = false;
  }
  const windowMs = 20_000;
  state.startedAt ??= t;
  state.blinkTimestamps = state.blinkTimestamps.filter((ts) => t - ts < windowMs);
  // Divide by the span actually observed so the rate is not diluted during the first 20s (calibration is 10s).
  const span = Math.max(2_000, Math.min(windowMs, t - state.startedAt));
  const blinkRate = (state.blinkTimestamps.length / span) * 60_000;

  // Head motion from transformation matrix translation (TODO: include rotation).
  const m = result.facialTransformationMatrixes?.[0]?.data;
  if (m) {
    state.poseHistory.push({ t, x: m[12], y: m[13], z: m[14] });
    state.poseHistory = state.poseHistory.filter((p) => t - p.t < 3000);
  }
  const headMotion = variance(state.poseHistory.map((p) => p.x)) + variance(state.poseHistory.map((p) => p.y));

  const tensionRaw = mean([
    bs.browDownLeft, bs.browDownRight, bs.jawForward, bs.mouthPressLeft, bs.mouthPressRight,
    bs.mouthPuckerLeft, bs.mouthPuckerRight, bs.noseSneerLeft, bs.noseSneerRight,
  ]);
  const smileRaw = mean([bs.mouthSmileLeft, bs.mouthSmileRight]);
  const squint = mean([bs.cheekSquintLeft, bs.cheekSquintRight]);

  state.ewma.tension = ewma(state.ewma.tension, tensionRaw);
  state.ewma.smile = ewma(state.ewma.smile, smileRaw);

  return {
    t,
    facePresent,
    confidence: facePresent ? 1 : 0, // TODO: derive from landmark visibility/presence
    blinkRate,
    gaze: classifyGaze(bs),
    headMotion,
    tension: state.ewma.tension ?? 0,
    smile: state.ewma.smile ?? 0,
    duchenne: smileRaw > 0.4 && squint > 0.3,
    fakeSmile: smileRaw > 0.4 && squint < 0.15,
    emotion: emotionFromBlendshapes(bs),
  };
}

function classifyGaze(bs: Record<string, number>): GazeTarget {
  // TODO(phase 2): combine with head pose and calibrate screen regions (cards bottom, chips center, villain top).
  const down = mean([bs.eyeLookDownLeft, bs.eyeLookDownRight]);
  const up = mean([bs.eyeLookUpLeft, bs.eyeLookUpRight]);
  const side = mean([bs.eyeLookOutLeft, bs.eyeLookOutRight, bs.eyeLookInLeft, bs.eyeLookInRight]);
  if (down > 0.5) return "cards";
  if (up > 0.5) return "opponent";
  if (side > 0.6) return "away";
  return "chips";
}

function ewma(prev: number | undefined, next: number, alpha = 0.3): number {
  return prev === undefined ? next : prev + alpha * (next - prev);
}

function mean(xs: Array<number | undefined>): number {
  const v = xs.filter((x): x is number => typeof x === "number");
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}

function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length;
}
