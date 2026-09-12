import { describe, expect, it } from "vitest";
import { chipAngle, renderPixelRatio, viewHeight } from "./motion";

describe("landing backdrop motion and framing", () => {
  it("turns at a constant rate through both faces and the edge", () => {
    expect(chipAngle(0)).toBe(0);
    expect(chipAngle(6)).toBeCloseTo(Math.PI / 2);
    expect(chipAngle(12)).toBe(Math.PI);
    expect(chipAngle(24)).toBe(2 * Math.PI);
    for (let second = 1; second <= 24; second++) {
      expect(chipAngle(second) - chipAngle(second - 1)).toBeCloseTo(Math.PI / 12);
    }
  });

  it.each([[400, 852], [320, 568], [1440, 900], [2560, 1080], [852, 400]])(
    "keeps the chip's 4.3-unit motion envelope inside a %i × %i viewport",
    (width, height) => {
      const vertical = viewHeight(width / height);
      expect(vertical).toBeGreaterThan(4.3);
      expect(vertical * width / height).toBeGreaterThan(4.3);
    },
  );

  it.each([[400, 852, 3], [1440, 900, 2], [3840, 2160, 2], [800, 600, 1]])(
    "caps DPR and fragment work for %i × %i at DPR %i",
    (width, height, dpr) => {
      const ratio = renderPixelRatio(width, height, dpr);
      expect(ratio).toBeLessThanOrEqual(Math.min(2, dpr));
      expect(width * height * ratio ** 2).toBeLessThanOrEqual(1_500_001);
    },
  );
});
