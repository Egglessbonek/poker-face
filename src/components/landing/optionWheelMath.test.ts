import { describe, expect, it } from "vitest";
import { rebaseLoop, wrapIndex } from "./optionWheelMath";

describe("infinite option wheel coordinates", () => {
  it("maps an unbounded counter back to the four actions", () => {
    expect([-5, -1, 0, 3, 4, 9].map((value) => wrapIndex(value, 4))).toEqual([
      3, 3, 0, 3, 0, 1,
    ]);
  });

  it("rebases both ends of the loop without changing their visual phase", () => {
    expect(rebaseLoop(0, -1, 4)).toEqual({ position: 4, target: 3 });
    expect(rebaseLoop(3, 4, 4)).toEqual({ position: -1, target: 0 });
  });

  it("drops invisible full rotations when input outruns the animation", () => {
    expect(rebaseLoop(0, 17, 4)).toEqual({ position: 0, target: 1 });
  });
});
