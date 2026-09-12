/** An unhurried, constant-speed revolution every 24 seconds. */
export function chipAngle(seconds: number) {
  return seconds * Math.PI / 12;
}

/** Fit the whole chip, including its bevel, thickness, wobble and float. */
export function viewHeight(aspect: number) {
  return Math.max(5.8, 4.9 / aspect);
}

export function renderPixelRatio(width: number, height: number, dpr: number) {
  // Bound fragment work even on Retina/4K displays: at most 1.5M pixels.
  return Math.min(dpr, 2, Math.sqrt(1_500_000 / (width * height)));
}
