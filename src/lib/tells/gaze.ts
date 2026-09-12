/**
 * Gaze zones. A webcam cannot say which pixel a player is looking at, but it can say which region of a laptop
 * screen they are looking at relative to where they looked during calibration (the center of the page): the
 * board in the middle, their cards and the bet controls at the bottom, up at the camera, or off to the side.
 * Everything is a delta from the player's own reference, so it survives different desks, laptops and heights.
 */

import type { GazeTarget } from "@/lib/types";

export interface GazeReference {
  gazeV: number;
  gazeH: number;
}

/** Default reference: a player looking at the middle of a laptop screen from a camera above it looks slightly down. */
export const DEFAULT_GAZE_REFERENCE: GazeReference = { gazeV: 0.25, gazeH: 0 };

/** Sideways delta beyond which the player is looking off-screen. */
export const AWAY_DH = 0.45;
/** Upward delta beyond which the player is looking at the camera (eye contact, on a screen). */
export const CAMERA_DV = -0.2;
/** Downward delta beyond which the player is looking at their cards / the bet controls. */
export const CARDS_DV = 0.25;

export function gazeZone(gazeV: number | undefined, gazeH: number | undefined, ref: GazeReference = DEFAULT_GAZE_REFERENCE): GazeTarget {
  if (gazeV === undefined || gazeH === undefined) return "unknown";
  const dv = gazeV - ref.gazeV;
  const dh = gazeH - ref.gazeH;
  if (Math.abs(dh) > AWAY_DH) return "away";
  if (dv < CAMERA_DV) return "camera";
  if (dv > CARDS_DV) return "cards";
  return "board";
}
