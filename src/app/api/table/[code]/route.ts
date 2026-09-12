import type { NextRequest } from "next/server";
import { handle } from "@/lib/game/http";
import { getState, resolveViewer, visibleTells } from "@/lib/game/table";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?token= -> current table state for that viewer (rail view without a token). */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/table/[code]">) {
  const { code } = await ctx.params;
  const token = req.nextUrl.searchParams.get("token");
  return handle(() => {
    const viewer = resolveViewer(code, token);
    return { state: getState(code, viewer), tells: visibleTells(code, viewer) };
  });
}
