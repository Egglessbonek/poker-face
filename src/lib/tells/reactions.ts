/**
 * What a face did in the seconds after a card landed. Pure, so it is testable; the hook feeds it the frame buffer.
 *
 * Every flag is a live-poker tell from the literature, translated to a laptop screen:
 *  - controlsGlance: gaze moved to the cards / bet-controls zone right after the card. Caro's most reliable
 *    strength tell is the glance at chips after seeing good cards; on a screen the chips are the bet controls.
 *  - boardStare: kept looking at the board for seconds after a community card. Caro: players who missed the
 *    flop stare at it; players who hit it look away quickly.
 *  - cardRecheck: looked back at their own cards a beat after a community card. Elwood: re-checking hole cards
 *    on a draw-heavy board usually means checking suits, i.e. a draw, not a made hand.
 *  - leanIn: moved toward the screen when the card landed. Caro: sudden interest means strength.
 *  - smileLeak: a genuine (Duchenne) smile in the window. Ekman.
 */

import type { BaselineStats, CardReaction, TellFrame } from "@/lib/types";
import { DEFAULT_GAZE_REFERENCE, gazeZone, type GazeReference } from "./gaze";

/** Seconds after a card during which a reaction counts. */
export const REACTION_WINDOW_MS = 3000;
/** A glance at the controls has to land this soon after the card to be "on seeing the card". */
const GLANCE_WITHIN_MS = 1500;
const GLANCE_DWELL_MS = 300;
/** Looking at the board this long after a community card is a stare, not a look. */
const STARE_MS = 2000;
/** A re-check is a return to the cards that starts this long after the card landed, and lasts at least this long. */
const RECHECK_AFTER_MS = 1200;
const RECHECK_DWELL_MS = 400;
/** Leaning in: this much closer than the moments before the card. */
const LEAN_IN_RATIO = 0.95;

export interface Reveal {
  event: CardReaction["event"];
  t: number;
}

const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Longest run (ms) of consecutive frames in `zone`, counting from the frame before each run's first frame. */
function longestDwell(frames: TellFrame[], zone: (f: TellFrame) => boolean): number {
  let best = 0;
  let runStart: number | null = null;
  for (let i = 0; i < frames.length; i++) {
    const inZone = zone(frames[i]);
    if (inZone && runStart === null) runStart = frames[i].t;
    if (!inZone && runStart !== null) {
      best = Math.max(best, frames[i].t - runStart);
      runStart = null;
    }
  }
  if (runStart !== null && frames.length) best = Math.max(best, frames[frames.length - 1].t - runStart);
  return best;
}

export function reactionFor(reveal: Reveal, buffer: TellFrame[], baseline: BaselineStats | null): CardReaction {
  const ref: GazeReference = baseline?.gazeV !== undefined && baseline?.gazeH !== undefined ? { gazeV: baseline.gazeV, gazeH: baseline.gazeH } : DEFAULT_GAZE_REFERENCE;
  const zone = (f: TellFrame) => gazeZone(f.gazeV, f.gazeH, ref);
  const face = buffer.filter((f) => f.facePresent);
  const before = face.filter((f) => f.t >= reveal.t - 1500 && f.t < reveal.t);
  const win = face.filter((f) => f.t >= reveal.t && f.t <= reveal.t + REACTION_WINDOW_MS);
  const early = win.filter((f) => f.t <= reveal.t + GLANCE_WITHIN_MS);
  const late = win.filter((f) => f.t >= reveal.t + RECHECK_AFTER_MS);
  const community = reveal.event !== "hole";

  const wasOnCards = before.length > 0 && before.filter((f) => zone(f) === "cards").length / before.length > 0.5;
  const controlsGlance = !wasOnCards && longestDwell(early, (f) => zone(f) === "cards") >= GLANCE_DWELL_MS;
  const boardStare = community && longestDwell(win, (f) => zone(f) === "board") >= STARE_MS;
  const cardRecheck = community && longestDwell(late, (f) => zone(f) === "cards") >= RECHECK_DWELL_MS && early.some((f) => zone(f) !== "cards");
  const dBefore = median(before.map((f) => f.distance).filter((d): d is number => d !== undefined));
  const dAfter = median(early.map((f) => f.distance).filter((d): d is number => d !== undefined));
  const leanIn = Number.isFinite(dBefore) && Number.isFinite(dAfter) && dBefore > 0 && dAfter / dBefore < LEAN_IN_RATIO;

  return {
    event: reveal.event,
    smileLeak: win.some((f) => f.duchenne),
    controlsGlance,
    boardStare,
    cardRecheck,
    leanIn,
    peakTension: win.reduce((m, f) => Math.max(m, f.tension), 0),
  };
}
