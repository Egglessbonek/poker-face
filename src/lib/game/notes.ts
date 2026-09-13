/**
 * The showdown notebook. At every showdown, each bet or raise a human made that hand becomes one fact: what
 * they held, whether it was a bluff by the Reveal's definition, what the tells said at the time, and how the
 * other seats answered. The AIs get these facts in their prompt and are told to adapt; how well they do is up
 * to the model. Pure: no store, no network.
 */

import { monteCarloEquity } from "@/lib/poker/equity";
import type { Action, ActionType, HandState, Player, ShowdownNote, Street, TellVector } from "@/lib/types";

const BOARD_CARDS: Record<string, number> = { preflop: 0, flop: 3, turn: 4, river: 5, showdown: 5 };
const AGGRESSIVE = new Set<ActionType>(["bet", "raise", "allin"]);

/** Tells that accompanied a human action, keyed by `${seat}:${at}` (the action log stores them separately). */
export type ActionTells = Map<string, TellVector | null>;
export const actionKey = (a: Pick<Action, "seat" | "at">) => `${a.seat}:${a.at}`;

/** Notes from one finished hand that reached showdown. Empty for a hand that folded out. */
export function showdownNotes(hand: Pick<HandState, "handNumber" | "board" | "actions" | "seats" | "results" | "foldedOut">, players: Player[], tells: ActionTells = new Map()): ShowdownNote[] {
  if (hand.foldedOut || !hand.results) return [];
  const bySeat = new Map(players.map((p) => [p.seat, p]));
  const shown = new Set(hand.results.filter((r) => r.descr).map((r) => r.seat));
  const notes: ShowdownNote[] = [];
  const folded = new Set<number>();
  const seated = hand.seats.filter(Boolean).length;
  hand.actions.forEach((a, i) => {
    if (a.type === "fold") folded.add(a.seat);
    const p = bySeat.get(a.seat);
    if (!p || p.kind !== "human" || !AGGRESSIVE.has(a.type) || !shown.has(a.seat)) return;
    const seat = hand.seats[a.seat];
    if (!seat) return;
    const live = Math.max(1, seated - folded.size - 1);
    const board = hand.board.slice(0, BOARD_CARDS[a.street] ?? 0);
    const equity = monteCarloEquity(seat.holeCards, board, live, 300).equity;
    const bluff = equity < 0.8 * (1 / (live + 1));
    const responses: ShowdownNote["responses"] = [];
    for (let j = i + 1; j < hand.actions.length && hand.actions[j].street === a.street; j++) {
      const r = hand.actions[j];
      if (r.seat === a.seat) break;
      const rp = bySeat.get(r.seat);
      if (rp) responses.push({ playerId: rp.id, name: rp.name, action: r.type });
    }
    const read = tells.get(actionKey(a));
    const result = hand.results!.find((r) => r.seat === a.seat);
    notes.push({
      handNumber: hand.handNumber,
      street: a.street as Street,
      playerId: p.id,
      name: p.name,
      action: a.type as ShowdownNote["action"],
      amount: a.amount,
      held: result?.descr ?? "unknown",
      bluff,
      equity,
      read: read ? { bluffLikelihood: read.bluffLikelihood, evidence: read.evidence.map((e) => e.text) } : undefined,
      responses,
      won: (result?.won ?? 0) > 0,
    });
  });
  return notes;
}

/** The notebook as prompt lines for one AI seat, newest last, at most `limit` per human. */
export function notebookLines(notes: ShowdownNote[], meId: string, humans: Array<{ id: string; name: string }>, limit = 6): string[] {
  const lines: string[] = [];
  for (const h of humans) {
    const mine = notes.filter((n) => n.playerId === h.id).slice(-limit);
    if (!mine.length) continue;
    lines.push(`Notebook on ${h.name} (what they showed at showdowns so far):`);
    for (const n of mine) {
      const size = n.amount ? ` ${n.amount}` : "";
      const verdict = n.bluff ? "a bluff" : "value";
      const read = n.read ? ` Tells then: ${Math.round(n.read.bluffLikelihood * 100)}% bluff${n.read.evidence.length ? ` (${n.read.evidence.join("; ")})` : ""}.` : " No camera read.";
      const answers = n.responses.length ? ` ${n.responses.map((r) => `${r.playerId === meId ? "you" : r.name} ${r.action === "allin" ? "went all in" : r.action + "ed"}`).join(", ")}.` : "";
      lines.push(`- H${n.handNumber} ${n.street}: ${n.action}${size} holding ${n.held}, ${verdict}.${read}${answers}${n.won ? " They won the showdown." : " They lost the showdown."}`);
    }
  }
  return lines;
}
