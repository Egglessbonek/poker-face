/**
 * AI seat brain: math baseline -> tell adjustment -> the seat's own model makes the call. Server only.
 *
 * Layer 1 (math): equity vs pot odds picks a baseline action (the same for every model).
 * Layer 2 (tells): the live opponents' bluffLikelihood shifts the perceived strength of their ranges.
 * Layer 3 (LLM): the model gets everything, including the baseline, and returns a validated JSON
 * decision + table talk in its own voice. Falls back to the math action on any failure.
 */

import "server-only";
import { z } from "zod";
import type { ActionType, VillainDecision, VillainDecisionInput } from "@/lib/types";
import { completeJSON, llmAvailable, perSeatModels } from "@/lib/llm/provider";
import { getProfile } from "./profile";
import { villainSystemPrompt, villainUserPrompt } from "./prompt";

const DecisionSchema = z.object({
  action: z.enum(["fold", "check", "call", "bet", "raise", "allin"]),
  amount: z.number().nullable().optional(),
  reasoning: z.string(),
  tableTalk: z.string().default(""),
  tellsUsed: z.array(z.string()).default([]),
});

/** Average bluff likelihood across live opponents with tell data, or 0. */
export function tellAdjustment(input: VillainDecisionInput): number {
  const live = input.opponents.filter((o) => !o.folded && o.tells && o.tells.confidence > 0.2);
  if (!live.length) return 0;
  const avg = live.reduce((a, o) => a + o.tells!.bluffLikelihood * o.tells!.confidence, 0) / live.length;
  // Opponents likely bluffing -> act as if we have more equity. Range: about -0.15 .. +0.15.
  return (avg - 0.5) * 0.3;
}

export function mathAction(input: VillainDecisionInput): ActionType {
  const { equity, potOdds, legalActions } = input;
  const eff = equity + tellAdjustment(input);
  const has = (a: ActionType) => legalActions.includes(a);
  const live = input.opponents.filter((o) => !o.folded).length;
  // Fair share of the pot when everyone has random hands; betting above it is +EV.
  const share = 1 / (live + 1);

  if (has("check")) {
    const open = has("bet") ? "bet" : has("raise") ? "raise" : null;
    return eff > share + 0.1 && open ? open : "check";
  }
  if (eff > Math.max(0.55, share + 0.25) && has("raise")) return "raise";
  if (eff > potOdds && has("call")) return "call";
  return "fold";
}

export async function decide(input: VillainDecisionInput): Promise<VillainDecision> {
  const profile = getProfile(input.modelId);
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
      system: villainSystemPrompt(profile),
      user: villainUserPrompt(input) + `\nFor reference, a plain equity-vs-pot-odds strategy would: ${baseline}.`,
      schema: DecisionSchema,
      model: perSeatModels() ? profile.id : undefined,
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
    console.error(`${profile.name} (${profile.id}) failed, using math action:`, (err as Error).message);
    return mathOnly("Model unavailable; math-only decision.");
  }
}

function clampAmount(action: ActionType, amount: number | undefined, input: VillainDecisionInput): number | undefined {
  const { minTotal, maxTotal } = input.bounds;
  if (action === "bet" || action === "raise") {
    const def = input.hand.currentBet + Math.round(input.hand.pot * 0.66); // 2/3 pot if the model gave no size
    return Math.max(minTotal, Math.min(maxTotal, Math.round(amount ?? def)));
  }
  if (action === "allin") return maxTotal;
  return undefined;
}
