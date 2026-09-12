/**
 * Cursor dynamics over the action bar during a decision.
 * Based on mouse-tracking research (Freeman & Ambady) and Slepian et al. 2013 (motion smoothness).
 *
 * Usage: const tracker = createCursorTracker(); attach to pointermove/pointerenter on the action bar;
 * call tracker.finish() when the hero clicks an action.
 */

import type { CursorStats } from "@/lib/types";

interface Point { x: number; y: number; t: number }

export interface CursorTracker {
  start(): void;
  move(x: number, y: number, t?: number): void;
  hover(target: "fold" | "bet" | null, t?: number): void;
  finish(): CursorStats;
}

export function createCursorTracker(): CursorTracker {
  let points: Point[] = [];
  let startT = 0;
  let hoverTarget: "fold" | "bet" | null = null;
  let hoverSince = 0;
  let hoverFoldMs = 0;
  let hoverBetMs = 0;

  const flushHover = (t: number) => {
    if (hoverTarget === "fold") hoverFoldMs += t - hoverSince;
    if (hoverTarget === "bet") hoverBetMs += t - hoverSince;
  };

  return {
    start() {
      points = [];
      startT = performance.now();
      hoverTarget = null;
      hoverFoldMs = 0;
      hoverBetMs = 0;
    },
    move(x, y, t = performance.now()) {
      points.push({ x, y, t });
    },
    hover(target, t = performance.now()) {
      flushHover(t);
      hoverTarget = target;
      hoverSince = t;
    },
    finish() {
      const t = performance.now();
      flushHover(t);
      // TODO(phase 3): tortuosity, reversals (sign changes in x-velocity), peak velocity.
      let pathLen = 0;
      let peakVelocity = 0;
      let reversals = 0;
      let lastDx = 0;
      for (let i = 1; i < points.length; i++) {
        const dx = points[i].x - points[i - 1].x;
        const dy = points[i].y - points[i - 1].y;
        const dt = Math.max(1, points[i].t - points[i - 1].t);
        const d = Math.hypot(dx, dy);
        pathLen += d;
        peakVelocity = Math.max(peakVelocity, d / dt);
        if (lastDx !== 0 && Math.sign(dx) !== 0 && Math.sign(dx) !== Math.sign(lastDx)) reversals++;
        if (dx !== 0) lastDx = dx;
      }
      const straight = points.length > 1 ? Math.hypot(points[points.length - 1].x - points[0].x, points[points.length - 1].y - points[0].y) : 0;
      return {
        timeToFirstMoveMs: points.length ? points[0].t - startT : t - startT,
        tortuosity: straight > 0 ? pathLen / straight : 1,
        reversals,
        hoverFoldMs,
        hoverBetMs,
        peakVelocity,
      };
    },
  };
}
