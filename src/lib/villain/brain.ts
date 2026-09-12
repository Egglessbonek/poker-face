/**
 * Villain brain: math baseline -> tell adjustment -> LLM final call. Server only.
 *
 * Layer 1 (math): equity vs pot odds picks a baseline action.
 * Layer 2 (tells): bluffLikelihood shifts the perceived strength of hero's range.
 * Layer 3 (LLM): gets everything and returns a validated JSON decision + table talk.
 * Falls back to the math action on any LLM failure. Every call is logged for the reveal.
 *
 * TODO(phase 4): bet sizing policy, aggression per persona, range-aware equity instead of random-hand equity.
 */

import "server-only";
import { z } from "zod";
import type { ActionType, VillainDecision, VillainDecisionInput } from "@/lib/types";
import { completeJSON, llmAvailable } from "@/lib/llm/provider";
import { getPersona } from "./personas";
import { villainSystemPrompt, villainUserPrompt } from "./prompt";

const DecisionSchema = z.object({
  action: z.enum(["fold", "check", "call", "bet", "raise", "allin"]),
  amount: z.number().nullable().optional(),
  reasoning: z.string(),
  tableTalk: z.string(),
  tellsUsed: z.array(z.string()).default([]),
});

export function mathAction(input: VillainDecisionInput): ActionType {
  const { equity, potOdds, legalActions } = input;
  const bluffAdj = input.tells ? (input.tells.bluffLikelihood - 0.5) * 0.3 : 0; // hero likely bluffing -> act as if we have more equity
  const eff = equity + bluffAdj;
  const has = (a: ActionType) => legalActions.includes(a);

  if (has("check")) return eff > 0.6 && has("bet") ? "bet" : "check";
  if (eff > 0.7 && has("raise")) return "raise";
  if (eff > potOdds && has("call")) return "call";
  return "fold";
}

export async function decide(input: VillainDecisionInput): Promise<VillainDecision> {
  const persona = getPersona(input.personaId);
  const baseline = mathAction(input);

  if (!llmAvailable()) {
    return {
      action: baseline,
      amount: clampAmount(baseline, undefined, input),
      reasoning: "No LLM key configured; math-only decision.",
      tableTalk: "",
      tellsUsed: [],
      mathAction: baseline,
      llmUsed: false,
    };
  }

  try {
    const out = await completeJSON({
      system: villainSystemPrompt(persona),
      user: villainUserPrompt(input) + `\nThe math-only recommendation is: ${baseline}.`,
      schema: DecisionSchema,
      temperature: 0.8,
    });
    const action = input.legalActions.includes(out.action) ? out.action : baseline;
    return {
      action,
      amount: clampAmount(action, out.amount ?? undefined, input),
      reasoning: out.reasoning,
      tableTalk: out.tableTalk,
      tellsUsed: out.tellsUsed,
      mathAction: baseline,
      llmUsed: true,
    };
  } catch (err) {
    console.error("villain LLM failed, using math action", err);
    return {
      action: baseline,
      amount: clampAmount(baseline, undefined, input),
      reasoning: "LLM unavailable; math-only decision.",
      tableTalk: "",
      tellsUsed: [],
      mathAction: baseline,
      llmUsed: false,
    };
  }
}

function clampAmount(action: ActionType, amount: number | undefined, input: VillainDecisionInput): number | undefined {
  const { minTotal, maxTotal } = input.bounds;
  if (action === "bet" || action === "raise") {
    // Default sizing: ~2/3 pot on top of the current bet.
    const def = input.hand.currentBet + Math.round(input.hand.pot * 0.66);
    return Math.max(minTotal, Math.min(maxTotal, Math.round(amount ?? def)));
  }
  if (action === "allin") return maxTotal;
  return undefined;
}
