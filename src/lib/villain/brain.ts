/**
 * AI player brain: math baseline -> tell adjustment -> LLM final call. Server only.
 *
 * Layer 1 (math): equity vs pot odds picks a baseline action; persona aggression widens betting.
 * Layer 2 (tells): the live opponents' bluffLikelihood shifts the perceived strength of their ranges.
 * Layer 3 (LLM): gets everything and returns a validated JSON decision + table talk.
 * Falls back to the math action on any LLM failure. Every call is logged for the reveal.
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

/** Average bluff likelihood across live opponents with tell data, or null. */
export function tellAdjustment(input: VillainDecisionInput): number {
  const live = input.opponents.filter((o) => !o.folded && o.tells && o.tells.confidence > 0.2);
  if (!live.length) return 0;
  const avg = live.reduce((a, o) => a + o.tells!.bluffLikelihood * o.tells!.confidence, 0) / live.length;
  // Opponents likely bluffing -> act as if we have more equity. Range: about -0.15 .. +0.15.
  return (avg - 0.5) * 0.3;
}

export function mathAction(input: VillainDecisionInput): ActionType {
  const persona = getPersona(input.personaId);
  const { equity, potOdds, legalActions } = input;
  const eff = equity + tellAdjustment(input);
  const has = (a: ActionType) => legalActions.includes(a);
  const live = input.opponents.filter((o) => !o.folded).length;
  // Fair share of the pot when everyone has random hands; betting above it is +EV.
  const share = 1 / (live + 1);
  const betEdge = 0.15 - persona.aggression * 0.15; // aggressive personas bet thinner

  if (has("check")) {
    const open = has("bet") ? "bet" : has("raise") ? "raise" : null;
    return eff > share + betEdge && open ? open : "check";
  }
  if (eff > Math.max(0.55, share + 0.25) && has("raise")) return "raise";
  if (eff > potOdds && has("call")) return "call";
  return "fold";
}

export async function decide(input: VillainDecisionInput): Promise<VillainDecision> {
  const persona = getPersona(input.personaId);
  const baseline = mathAction(input);

  const mathOnly = (why: string): VillainDecision => ({
    action: baseline,
    amount: clampAmount(baseline, undefined, input),
    reasoning: why,
    tableTalk: "",
    tellsUsed: [],
    mathAction: baseline,
    llmUsed: false,
  });

  if (!llmAvailable()) return mathOnly("No LLM key configured; math-only decision.");

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
    console.error("AI LLM failed, using math action", err);
    return mathOnly("LLM unavailable; math-only decision.");
  }
}

function clampAmount(action: ActionType, amount: number | undefined, input: VillainDecisionInput): number | undefined {
  const { minTotal, maxTotal } = input.bounds;
  if (action === "bet" || action === "raise") {
    // Default sizing: 50-90% of pot on top of the current bet, scaled by persona aggression.
    const persona = getPersona(input.personaId);
    const frac = 0.5 + persona.aggression * 0.4;
    const def = input.hand.currentBet + Math.round(input.hand.pot * frac);
    return Math.max(minTotal, Math.min(maxTotal, Math.round(amount ?? def)));
  }
  if (action === "allin") return maxTotal;
  return undefined;
}
