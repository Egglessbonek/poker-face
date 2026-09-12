/**
 * Prompt construction for the villain brain and the ElevenLabs agent context.
 * Ported pattern: Haggle's buildStressContext() -> buildTellContext().
 */

import type { Persona, VillainDecisionInput } from "@/lib/types";
import { describeTells } from "@/lib/tells/fuse";

export function villainSystemPrompt(persona: Persona): string {
  return [
    `You are ${persona.name}, a heads-up No-Limit Hold'em player. ${persona.style}`,
    "You receive the full game state, your equity, pot odds, and a read on the opponent's physical tells from a camera.",
    "Decide the best action. Math is the foundation; tells adjust how strong you believe the opponent is.",
    "Never reveal your own cards. Keep tableTalk to at most two short sentences, in character, and reference a concrete tell when you use one.",
    'Respond with JSON only: {"action": "fold|check|call|bet|raise|allin", "amount": number|null, "reasoning": string, "tableTalk": string, "tellsUsed": string[]}',
  ].join("\n");
}

export function villainUserPrompt(input: VillainDecisionInput): string {
  const h = input.hand;
  const lines = [
    `Hand #${h.handNumber}, street: ${h.street}, board: ${h.board.join(" ") || "(none)"}`,
    `Your cards: ${input.villain.holeCards.join(" ")}. Your stack ${input.villain.stack}, committed ${input.villain.committed}.`,
    `Opponent stack ${input.hero.stack}, committed ${input.hero.committed}. Pot ${h.pot}, current bet ${h.currentBet}, min raise ${h.minRaise}.`,
    `Legal actions: ${input.legalActions.join(", ")}.`,
    `Your equity vs a random hand: ${(input.equity * 100).toFixed(0)}%. Pot odds to call: ${(input.potOdds * 100).toFixed(0)}%.`,
    `Action history this hand: ${h.actions.map((a) => `${a.seat} ${a.type}${a.amount ? " " + a.amount : ""}`).join(", ") || "none"}.`,
    input.tells ? `Opponent tells on their last action: ${describeTells(input.tells)}` : "No tell data available.",
  ];
  return lines.join("\n");
}

/** Short text pushed to the ElevenLabs agent via sendContextualUpdate every ~2s while hero acts. */
export function buildTellContext(input: { arousal: number; trend: string; evidence: string[] }): string {
  return `[TELLS] Opponent arousal ${input.arousal}/100 (${input.trend}). ${input.evidence.join("; ") || "nothing notable"}.`;
}

/** Game event pushed via sendUserMessage so the agent speaks. */
export function buildEventMessage(event: string, tableTalk?: string): string {
  return `[EVENT] ${event}${tableTalk ? ` Say something like: "${tableTalk}"` : " React in one short line."}`;
}
