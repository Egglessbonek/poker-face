/** A positive modulo, used to turn an unbounded wheel position into an item index. */
export function wrapIndex(value: number, count: number) {
  if (count <= 0) return 0;
  return ((value % count) + count) % count;
}

/**
 * Keep the coordinates near the rendered copies without changing what the wheel
 * looks like. Moving either coordinate by a whole cycle is visually identical.
 */
export function rebaseLoop(
  position: number,
  target: number,
  count: number,
) {
  if (count <= 1) return { position, target };

  const rebasedTarget = wrapIndex(target, count);
  const cycleShift = target - rebasedTarget;
  let rebasedPosition = position - cycleShift;
  let lag = rebasedPosition - rebasedTarget;

  // A user can click faster than the easing animation. Whole queued rotations
  // are indistinguishable, so discard them while preserving the visible phase.
  if (Math.abs(lag) > count / 2) {
    lag = wrapIndex(lag, count);
    if (lag > count / 2) lag -= count;
    rebasedPosition = rebasedTarget + lag;
  }

  return { position: rebasedPosition, target: rebasedTarget };
}
