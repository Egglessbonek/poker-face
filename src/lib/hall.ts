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

const byPokerFace = (a: HallEntry, b: HallEntry) => b.pokerFace - a.pokerFace || b.at - a.at;

/** Best poker faces first; ties go to the most recent. */
export function getHall(limit = 10): HallEntry[] {
  return [...hall].sort(byPokerFace).slice(0, limit);
}

/**
 * Where one match result stands among every face read since the server started: 1-based rank and the
 * field size. Null when that player has no entry (no camera, or the server restarted since the match).
 */
export function hallRank(code: string, name: string): { rank: number; of: number } | null {
  const ranked = [...hall].sort(byPokerFace);
  const i = ranked.findIndex((e) => e.code === code && e.name === name);
  return i === -1 ? null : { rank: i + 1, of: ranked.length };
}
