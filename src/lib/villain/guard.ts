/**
 * Guards on what a model returns, applied before anything reaches the table.
 *
 * - `leaksOwnCards`: a spoken line must never name a card the seat holds. The prompt forbids it; models still
 *   do it, so the line is dropped server-side. Ranks also on the board are public and stay allowed.
 * - `canonicalTells`: `tellsUsed` may only contain tells that exist in the evidence the model was shown, phrased
 *   as "<player>: <evidence>". Models paraphrase ("that quick look at the chips") or paste the summary line
 *   ("arousal 68/100, bluff likelihood 59%"), so each string is mapped by keyword to a real evidence signal.
 */

import type { Card, OpponentView } from "@/lib/types";

const RANK_WORDS: Record<string, string[]> = {
  A: ["ace", "aces"], K: ["king", "kings"], Q: ["queen", "queens"], J: ["jack", "jacks"], T: ["ten", "tens"],
  "9": ["nine", "nines"], "8": ["eight", "eights"], "7": ["seven", "sevens"], "6": ["six", "sixes"], "5": ["five", "fives"],
  "4": ["four", "fours"], "3": ["three", "threes", "trey", "treys"], "2": ["two", "twos", "deuce", "deuces"],
};
const SUIT_SYMBOL: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
const SUIT_WORD: Record<string, string> = { s: "spades", h: "hearts", d: "diamonds", c: "clubs" };
/** Rank+suit tokens that are also English words ("As you can see", "Ah, a flop"): never treated as cards. */
const AMBIGUOUS_TOKENS = new Set(["As", "Ah"]);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const word = (w: string, flags = "") => new RegExp(`\\b${escape(w)}\\b`, flags);

/** True when `text` names a card in `hole` (rank word, rank+suit, "pocket <rank>s", or both ranks as a combo). */
export function leaksOwnCards(text: string, hole: Card[], board: Card[]): boolean {
  if (!text.trim() || !hole.length) return false;
  const lower = text.toLowerCase();
  const boardRanks = new Set(board.map((c) => c[0]));
  const holeRanks = hole.map((c) => c[0]);
  for (const r of holeRanks) for (const w of RANK_WORDS[r] ?? []) if (word(`pocket ${w}`).test(lower)) return true;
  for (const r of holeRanks.filter((x) => !boardRanks.has(x))) for (const w of RANK_WORDS[r] ?? []) if (word(w).test(lower)) return true;
  for (const c of hole) {
    const [r, s] = [c[0], c[1]];
    if (!AMBIGUOUS_TOKENS.has(c) && word(c).test(text)) return true;
    if (lower.includes(`${r.toLowerCase()}${SUIT_SYMBOL[s]}`)) return true;
    for (const w of RANK_WORDS[r] ?? []) if (lower.includes(`${w} of ${SUIT_WORD[s]}`)) return true;
  }
  if (hole.length === 2) {
    const [a, b] = holeRanks;
    const combo = (x: string, y: string) => new RegExp(`\\b${escape(x)}[- ]?${escape(y)}[os]?\\b`, "i");
    if (combo(a, b).test(text) || combo(b, a).test(text)) return true;
    const [wa, wb] = [RANK_WORDS[a]?.[0], RANK_WORDS[b]?.[0]];
    if (wa && wb && (word(`${wa}[- ]${wb}`).test(lower) || word(`${wb}[- ]${wa}`).test(lower))) return true;
  }
  return false;
}

/** Keyword -> candidate evidence signals, in priority order. Only signals that exist in `fuse.ts` can come out. */
const SIGNAL_WORDS: Array<[RegExp, string[]]> = [
  [/blink/, ["blink_rate", "post_blink_rebound"]],
  [/sat back|lean(ed|ing)? back|relax|loosen/, ["post_lean_back"]],
  [/lean(ed|ing)? in|sat up|sudden interest|perked/, ["lean_in", "post_lean_in"]],
  [/look(ed|ing)? away|avoid|never (looked )?up|no eye contact|eyes down|(would|will|did|could)( not|n't) look/, ["post_gaze_away"]],
  [/\bstill|froze|frozen|motionless|stiff/, ["freeze", "post_freeze"]],
  [/tension|tense|jaw|brow|clench/, ["tension", "post_tension_drop"]],
  [/smile|smirk|grin/, ["smile_leak", "post_smile"]],
  [/stare|staring|stared/, ["board_stare"]],
  [/re-?check|back at (their|his|her|your) cards|checked (their|his|her|your) cards|double-?check/, ["card_recheck"]],
  [/chip|control|slider|stack|bet button/, ["controls_glance"]],
  [/\bfast|quick|snap|instant|rapid|hurr/, ["fast_action"]],
  [/\bslow|long time|took .{0,12}time|tank|hesitat|deliberat/, ["slow_action"]],
];

/** Tells the model may claim, rephrased as the evidence the table actually recorded. At most four. */
export function canonicalTells(raw: string[], opponents: OpponentView[]): string[] {
  const humans = opponents.filter((o) => !o.folded && o.kind === "human" && (o.tells || o.after));
  const evidenceOf = (o: OpponentView) => [...(o.tells?.evidence ?? []), ...(o.after?.evidence ?? [])];
  const out: string[] = [];
  const push = (s: string) => { if (!out.includes(s)) out.push(s); };
  for (const r of raw) {
    const lower = r.toLowerCase();
    const named = humans.filter((h) => lower.includes(h.name.toLowerCase()));
    const pool = named.length ? named : humans;
    // A line about "after" the bet prefers the post-bet evidence; otherwise the decision read comes first.
    const afterFirst = /after|once (they|he|she|you) bet|post-?bet|since betting/.test(lower);
    let matched = false;
    for (const [re, signals] of SIGNAL_WORDS) {
      if (!re.test(lower)) continue;
      const order = afterFirst ? [...signals].reverse() : signals;
      for (const o of pool) {
        const evidence = evidenceOf(o);
        const e = order.map((signal) => evidence.find((ev) => ev.signal === signal)).find(Boolean);
        if (e) { push(`${o.name}: ${e.text}`); matched = true; break; }
      }
      if (matched) break;
    }
    if (!matched && /bluff|arousal|confiden|read|likel/.test(lower) && pool.length === 1 && pool[0].tells) {
      push(`${pool[0].name}: ${Math.round(pool[0].tells.bluffLikelihood * 100)}% bluff likelihood overall`);
    }
  }
  return out.slice(0, 4);
}
