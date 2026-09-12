import { describe, expect, it } from "vitest";
import type { FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import { createFeatureState, extractFrame } from "../features";

/** Minimal FaceLandmarker result with the blendshapes we care about. */
function result(bs: Record<string, number>, opts: { face?: boolean; pose?: [number, number, number] } = {}): FaceLandmarkerResult {
  const face = opts.face ?? true;
  const [x, y, z] = opts.pose ?? [0, 0, -30];
  const data = new Array(16).fill(0);
  data[12] = x; data[13] = y; data[14] = z;
  return {
    faceLandmarks: face ? [[{ x: 0.5, y: 0.5, z: 0 }]] : [],
    faceBlendshapes: face ? [{ headIndex: 0, headName: "", categories: Object.entries(bs).map(([categoryName, score], index) => ({ index, score, categoryName, displayName: categoryName })) }] : [],
    facialTransformationMatrixes: face ? [{ rows: 4, columns: 4, data }] : [],
  } as unknown as FaceLandmarkerResult;
}

describe("extractFrame", () => {
  it("counts a blink once per close/open cycle and reports a per-minute rate over the observed span", () => {
    const s = createFeatureState();
    let t = 1_000_000;
    const step = (blink: number) => extractFrame(result({ eyeBlinkLeft: blink, eyeBlinkRight: blink }), (t += 33), s);
    for (let i = 0; i < 30; i++) step(0.05); // ~1s open
    step(0.9); step(0.95); step(0.9); // one blink held over 3 frames
    for (let i = 0; i < 30; i++) step(0.05);
    const f = step(0.05);
    expect(s.blinkTimestamps).toHaveLength(1);
    // 1 blink over ~2.1s -> about 28/min (span is clamped to >= 2s).
    expect(f.blinkRate).toBeGreaterThan(20);
    expect(f.blinkRate).toBeLessThan(35);
  });

  it("does not count a long closure as many blinks", () => {
    const s = createFeatureState();
    let t = 1_000_000;
    for (let i = 0; i < 20; i++) extractFrame(result({ eyeBlinkLeft: 0.9, eyeBlinkRight: 0.9 }), (t += 33), s);
    expect(s.blinkTimestamps).toHaveLength(1);
  });

  it("maps eye-look blendshapes to gaze targets", () => {
    const s = createFeatureState();
    expect(extractFrame(result({ eyeLookDownLeft: 0.8, eyeLookDownRight: 0.8 }), 1, s).gaze).toBe("cards");
    expect(extractFrame(result({ eyeLookUpLeft: 0.7, eyeLookUpRight: 0.7 }), 2, s).gaze).toBe("opponent");
    expect(extractFrame(result({ eyeLookOutLeft: 0.9, eyeLookInRight: 0.9 }), 3, s).gaze).toBe("away");
    expect(extractFrame(result({}), 4, s).gaze).toBe("chips");
  });

  it("head motion rises when the pose moves and stays near zero when still", () => {
    const still = createFeatureState();
    let t = 1_000_000;
    let f = extractFrame(result({}, { pose: [1, 1, -30] }), t, still);
    for (let i = 0; i < 20; i++) f = extractFrame(result({}, { pose: [1, 1, -30] }), (t += 33), still);
    expect(f.headMotion).toBeCloseTo(0, 6);
    const moving = createFeatureState();
    for (let i = 0; i < 20; i++) f = extractFrame(result({}, { pose: [i % 2 ? 5 : -5, i % 3 ? 4 : -4, -30] }), (t += 33), moving);
    expect(f.headMotion).toBeGreaterThan(10);
  });

  it("tells a Duchenne smile from a forced one and tracks tension", () => {
    const s = createFeatureState();
    const real = extractFrame(result({ mouthSmileLeft: 0.7, mouthSmileRight: 0.7, cheekSquintLeft: 0.5, cheekSquintRight: 0.5 }), 1, s);
    expect(real.duchenne).toBe(true);
    expect(real.fakeSmile).toBe(false);
    const forced = extractFrame(result({ mouthSmileLeft: 0.7, mouthSmileRight: 0.7, cheekSquintLeft: 0.05, cheekSquintRight: 0.05 }), 2, s);
    expect(forced.fakeSmile).toBe(true);
    const tense = createFeatureState();
    let f = extractFrame(result({ browDownLeft: 0.8, browDownRight: 0.8, jawForward: 0.6, mouthPressLeft: 0.7, mouthPressRight: 0.7 }), 1, tense);
    for (let i = 2; i < 12; i++) f = extractFrame(result({ browDownLeft: 0.8, browDownRight: 0.8, jawForward: 0.6, mouthPressLeft: 0.7, mouthPressRight: 0.7 }), i, tense);
    expect(f.tension).toBeGreaterThan(0.3);
  });

  it("reports no face with zero confidence", () => {
    const f = extractFrame(result({}, { face: false }), 1, createFeatureState());
    expect(f.facePresent).toBe(false);
    expect(f.confidence).toBe(0);
  });
});
