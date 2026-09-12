import { NextResponse, type NextRequest } from "next/server";
import { decide } from "@/lib/villain/brain";
import { monteCarloEquity, potOdds } from "@/lib/poker/equity";
import { appendLog } from "@/lib/store";
import type { VillainDecisionInput } from "@/lib/types";

export const runtime = "nodejs";

/**
 * POST { sessionId, input: Omit<VillainDecisionInput, "equity" | "potOdds"> }
 * Computes equity + pot odds server-side (villain's hole cards never leave the server in a real build;
 * TODO(phase 1): move hand state ownership to the server so the client can't read villain cards).
 */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as { sessionId: string; input: Omit<VillainDecisionInput, "equity" | "potOdds"> };
  const { hand, villain, hero } = body.input;
  const toCall = hand.currentBet - villain.committed;
  const eq = monteCarloEquity(villain.holeCards, hand.board);
  const input: VillainDecisionInput = { ...body.input, equity: eq.equity, potOdds: potOdds(toCall, hand.pot) };
  const decision = await decide(input);
  appendLog(body.sessionId, { kind: "villain_decision", data: { input: { ...input, villain: { ...villain } }, decision } });
  void hero;
  return NextResponse.json({ decision, equity: eq });
}
