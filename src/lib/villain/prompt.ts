/**
 * Prompt construction for AI players (multi-way pots).
 * Ported pattern: Haggle's buildStressContext() -> tells section per opponent.
 */

import type { Persona, VillainDecisionInput } from "@/lib/types";
import { describeTells } from "@/lib/tells/fuse";

export function villainSystemPrompt(persona: Persona): string {
  return [
    `You are ${persona.name}, a No-Limit Hold'em player at a table with humans and other AIs. ${persona.style}`,
    "You receive the full game state, your equity against the players still in the hand, pot odds, and for each human opponent a camera-based read of their physical tells.",
    "Decide the best action. Math is the foundation; tells adjust how strong you believe a specific opponent is. Do not fold strong hands because of tells alone.",
    "Never reveal your own cards. tableTalk is spoken aloud at the table: at most two short sentences, in character, addressed to a player by name when you use one of their tells.",
    'Respond with JSON only: {"action": "fold|check|call|bet|raise|allin", "amount": number|null, "reasoning": string, "tableTalk": string, "tellsUsed": string[]}',
    "amount is your TOTAL chips committed on this street after the action (for bet/raise), within the legal bounds.",
  ].join("\n");
}

export function villainUserPrompt(input: VillainDecisionInput): string {
  const h = input.hand;
  const name = (seat: number) => input.names[seat] ?? `seat ${seat}`;
  const history = h.actions.map((a) => `${a.street} ${name(a.seat)} ${a.type}${a.amount ? " " + a.amount : ""}`).join(", ") || "none";
  const opps = input.opponents.map((o) => {
    const status = o.folded ? "folded" : o.allIn ? "all-in" : "active";
    const tells = o.kind === "human" ? (o.tells ? `tells: ${describeTells(o.tells)}` : "tells: no data") : "AI player";
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
