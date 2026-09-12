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
import { decisionRoll, recommend, type Recommendation } from "@/lib/poker/strategy";
import { canonicalTells, leaksOwnCards } from "./guard";
import { getProfile } from "./profile";
import { villainSystemPrompt, villainUserPrompt } from "./prompt";

const DecisionSchema = z.object({
  action: z.enum(["fold", "check", "call", "bet", "raise", "allin"]),
  amount: z.number().nullable().optional(),
  reasoning: z.string(),
  tableTalk: z.string().default(""),
  tellsUsed: z.array(z.string()).default([]),
});

/**
 * Equity shift from the live opponents' tells, or 0. Each read counts by its distance from neutral (0.5) scaled
 * by its confidence, so a low-confidence read shrinks toward zero rather than toward "opponent is strong".
 * Opponents likely bluffing -> act as if we have more equity. Range: -0.2 .. +0.2, enough that a confident
 * read flips a marginal spot, which is the whole point of the table.
 */
function bigPotEffort(): "low" | "medium" | "high" {
  const e = process.env.AI_BIG_POT_EFFORT;
  return e === "medium" || e === "high" ? e : "low";
}

export function tellAdjustment(input: VillainDecisionInput): number {
  // Two reads per live human: on their decision, and after their bet. Each counts by distance from neutral times confidence.
  const reads = input.opponents
    .filter((o) => !o.folded)
    .flatMap((o) => [o.tells, o.after].filter((v): v is NonNullable<typeof v> => !!v && v.confidence > 0.2));
  if (!reads.length) return 0;
  const avg = reads.reduce((a, v) => a + (v.bluffLikelihood - 0.5) * v.confidence, 0) / reads.length;
  return avg * 0.4;
}

/** The strategy module's recommendation for this spot. `withTells` folds the opponents' tells into equity. */
export function mathRecommendation(input: VillainDecisionInput, withTells = true): Recommendation {
  return recommend({
    street: input.hand.street,
    hole: input.me.holeCards,
    board: input.hand.board,
    equity: Math.max(0, Math.min(1, input.equity + (withTells ? tellAdjustment(input) : 0))),
    potOdds: input.potOdds,
    pot: input.hand.pot,
    toCall: input.bounds.toCall,
    currentBet: input.hand.currentBet,
    stack: input.me.stack,
    committed: input.me.committed,
    position: input.me.position,
    live: input.opponents.filter((o) => !o.folded).length,
    legal: input.legalActions,
    minTotal: input.bounds.minTotal,
    maxTotal: input.bounds.maxTotal,
    bigBlind: input.bigBlind,
    hasInitiative: input.hasInitiative,
    raisesThisStreet: input.raisesThisStreet,
    roll: decisionRoll(input.hand.handNumber, input.hand.street, input.me.holeCards),
  });
}

/** Pure math, no tells: the attribution baseline. */
export function mathAction(input: VillainDecisionInput): ActionType {
  return mathRecommendation(input, false).action;
}

export async function decide(input: VillainDecisionInput): Promise<VillainDecision> {
  const profile = getProfile(input.modelId);
  const rec = mathRecommendation(input, true); // what we play (and show the model) when tells are available
  const pure = mathRecommendation(input, false).action; // attribution baseline: the same strategy with no tells
  const baseline = rec.action;

  const mathOnly = (why: string): VillainDecision => ({
    action: baseline,
    amount: clampAmount(baseline, rec.amount, input),
    reasoning: why,
    tableTalk: "",
    tellsUsed: [],
    mathAction: pure,
    tellAction: baseline,
    llmUsed: false,
  });

  if (!llmAvailable()) return mathOnly("No LLM key configured; math-only decision.");

  try {
    const out = await completeJSON({
      system: villainSystemPrompt(profile),
      user: villainUserPrompt(input, rec),
      schema: DecisionSchema,
      model: perSeatModels() ? profile.id : undefined,
      temperature: 0.7,
      // Bigger pots can get more thought (AI_BIG_POT_EFFORT=medium|high); default low keeps every turn under a few seconds.
      reasoningEffort: input.hand.pot + input.bounds.toCall >= 0.3 * (input.me.stack + input.me.committed) ? bigPotEffort() : "low",
    });
    const action = input.legalActions.includes(out.action) ? out.action : baseline;
    let tableTalk = out.tableTalk;
    if (leaksOwnCards(tableTalk, input.me.holeCards, input.hand.board)) {
      console.warn(`${profile.name} named its own cards in table talk; line dropped:`, tableTalk);
      tableTalk = "";
    }
    return {
      action,
      amount: clampAmount(action, out.amount ?? (action === baseline ? rec.amount : undefined), input),
      reasoning: out.reasoning,
      tableTalk,
      tellsUsed: canonicalTells(out.tellsUsed, input.opponents),
      mathAction: pure,
      tellAction: baseline,
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
