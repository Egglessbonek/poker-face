/**
 * MediaPipe Face Landmarker wrapper (client only).
 * WASM is loaded from jsDelivr, the model from Google's storage bucket.
 */

import { FaceLandmarker, FilesetResolver, type FaceLandmarkerResult } from "@mediapipe/tasks-vision";

const WASM_PATH = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL_PATH =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

let instance: FaceLandmarker | null = null;

export async function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (instance) return instance;
  const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
  instance = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_PATH, delegate: "GPU" },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  });
  return instance;
}

export type DetectCallback = (result: FaceLandmarkerResult, timestampMs: number) => void;

/**
 * Runs detectForVideo on every animation frame. `getVideo` is a getter so the loop survives the
 * <video> element being remounted elsewhere in the tree. Returns a stop function.
 */
export function startDetectionLoop(getVideo: () => HTMLVideoElement | null, landmarker: FaceLandmarker, onResult: DetectCallback): () => void {
  let raf = 0;
  let lastVideoTime = -1;
  const tick = () => {
    const video = getVideo();
    if (video && video.currentTime !== lastVideoTime && video.readyState >= 2) {
      lastVideoTime = video.currentTime;
      const ts = performance.now();
      const result = landmarker.detectForVideo(video, ts);
      onResult(result, ts);
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

/** Convenience: blendshape categories -> { name: score }. */
export function blendshapeMap(result: FaceLandmarkerResult): Record<string, number> {
  const out: Record<string, number> = {};
  const cats = result.faceBlendshapes?.[0]?.categories ?? [];
  for (const c of cats) out[c.categoryName] = c.score;
  return out;
}
