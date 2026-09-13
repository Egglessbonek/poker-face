import type { NextRequest } from "next/server";
import { body, handle } from "@/lib/game/http";
import { placePredictionBet } from "@/lib/prediction/market";

export const runtime = "nodejs";

/** Verify a confirmed Solana devnet transfer and attach it to an open rail market. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/table/[code]/predictions/bet">) {
  const { code } = await ctx.params;
  const input = await body<{ marketId: string; outcomeId: string; wallet: string; stakeLamports: number; signature: string }>(req);
  return handle(() => placePredictionBet(code, input));
}
