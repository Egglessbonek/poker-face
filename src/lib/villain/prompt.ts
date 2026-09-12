/**
 * Prompt construction for AI seats (multi-way pots). The model is told who it is and asked to play as
 * itself; nothing here assigns a character.
 */

import type { ModelProfile, VillainDecisionInput } from "@/lib/types";
import { describeTells } from "@/lib/tells/fuse";

export function villainSystemPrompt(profile: ModelProfile): string {
  return [
    `You are ${profile.name}, a language model made by ${profile.vendor}, seated at a No-Limit Hold'em table with human players and other AI models. You are playing as yourself: speak and decide in whatever voice and temperament you actually have. No assigned character.`,
    "Each turn you receive the full game state, your equity against the players still in the hand, pot odds, and for each human opponent a camera-based read of their physical tells.",
    "Decide the action you think is best. The math is the foundation; tells are evidence about a specific opponent's strength, weigh them as you see fit. Do not fold strong hands because of tells alone.",
    "Cite only the tells listed in the evidence. Never invent readings that are not there: no heart rate, pulse, sweat, or anything the camera did not report.",
    "Never reveal your own cards. tableTalk is spoken aloud at the table: at most two short sentences, addressed to a player by name when you use one of their tells. Leave it empty if you have nothing to say.",
    'Respond with JSON only: {"action": "fold|check|call|bet|raise|allin", "amount": number|null, "reasoning": string, "tableTalk": string, "tellsUsed": string[]}',
    "amount is your TOTAL chips committed on this street after the action (for bet/raise), within the legal bounds.",
    "Keep reasoning to one or two sentences. Decide quickly; the table is waiting.",
  ].join("\n");
}

export function villainUserPrompt(input: VillainDecisionInput): string {
  const h = input.hand;
  const name = (seat: number) => input.names[seat] ?? `seat ${seat}`;
  const history = h.actions.map((a) => `${a.street} ${name(a.seat)} ${a.type}${a.amount ? " " + a.amount : ""}`).join(", ") || "none";
  const opps = input.opponents.map((o) => {
    const status = o.folded ? "folded" : o.allIn ? "all-in" : "active";
    const tells = o.kind === "human" ? (o.tells ? `tells: ${describeTells(o.tells)}` : "tells: no data") : "AI model";
    return `- ${o.name} (${o.position}, ${status}): stack ${o.stack}, committed ${o.committed}. ${tells}`;
  });
  return [
    `Hand #${h.handNumber}, street: ${h.street}, board: ${h.board.join(" ") || "(none)"}`,
    `You are ${input.me.position}. Your cards: ${input.me.holeCards.join(" ")}. Your stack ${input.me.stack}, committed ${input.me.committed}.`,
    `Pot ${h.pot}, current bet ${h.currentBet}, min raise ${h.minRaise}. To call: ${input.bounds.toCall}. Bet/raise total must be between ${input.bounds.minTotal} and ${input.bounds.maxTotal}.`,
    `Legal actions: ${input.legalActions.join(", ")}.`,
    `Your equity vs ${input.opponents.filter((o) => !o.folded).length} live opponent(s) holding random hands: ${(input.equity * 100).toFixed(0)}%. Pot odds to call: ${(input.potOdds * 100).toFixed(0)}%.`,
    "Opponents:",
    ...opps,
    `Action history: ${history}.`,
  ].join("\n");
}
