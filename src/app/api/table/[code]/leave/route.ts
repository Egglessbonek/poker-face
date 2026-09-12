import type { NextRequest } from "next/server";
import { body, handle } from "@/lib/game/http";
import { leaveTable } from "@/lib/game/table";

export const runtime = "nodejs";

/** POST { token } — leave the lobby, or sit out for the rest of the match. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/table/[code]/leave">) {
  const { code } = await ctx.params;
  const b = await body<{ token: string }>(req);
  return handle(() => leaveTable(code, b.token));
}
