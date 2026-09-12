/**
 * Hall of Poker Faces: in-memory leaderboard of human players' poker-face results (globalThis-backed).
 * Single-process deployment only; entries live until the server restarts.
 */

import "server-only";
import type { HallEntry } from "@/lib/types";

const MAX_ENTRIES = 200;

const g = globalThis as unknown as { __hall?: HallEntry[] };
const hall = (g.__hall ??= []);

/** Add the results of a finished match. Kept newest first; at most 200 entries, the oldest dropped. */
export function recordHall(entries: HallEntry[]): void {
  if (!entries.length) return;
  hall.push(...entries);
  hall.sort((a, b) => b.at - a.at);
  if (hall.length > MAX_ENTRIES) hall.length = MAX_ENTRIES;
}

/** Best poker faces first; ties go to the most recent. */
export function getHall(limit = 10): HallEntry[] {
  return [...hall].sort((a, b) => b.pokerFace - a.pokerFace || b.at - a.at).slice(0, limit);
}
