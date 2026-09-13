import type { NextRequest } from "next/server";
import { body, handle } from "@/lib/game/http";
import { claimPredictionWinnings } from "@/lib/prediction/market";

export const runtime = "nodejs";

/** Trigger all settled, unclaimed payouts for this wallet at this table. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/table/[code]/predictions/claim">) {
  const { code } = await ctx.params;
  const { wallet } = await body<{ wallet: string }>(req);
  return handle(() => claimPredictionWinnings(code, wallet));
}
