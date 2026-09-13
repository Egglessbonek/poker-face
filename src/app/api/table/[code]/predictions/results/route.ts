import type { NextRequest } from "next/server";
import { handle } from "@/lib/game/http";
import { predictionResults } from "@/lib/prediction/market";

export const runtime = "nodejs";

/** Public market totals, plus the requested devnet wallet's own bet history. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/table/[code]/predictions/results">) {
  const { code } = await ctx.params;
  const wallet = req.nextUrl.searchParams.get("wallet") ?? undefined;
  return handle(() => predictionResults(code, wallet));
}
