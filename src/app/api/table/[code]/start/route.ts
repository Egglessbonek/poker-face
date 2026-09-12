import type { NextRequest } from "next/server";
import { body, handle } from "@/lib/game/http";
import { startTable } from "@/lib/game/table";

export const runtime = "nodejs";

/** POST { token } — host starts the match. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/table/[code]/start">) {
  const { code } = await ctx.params;
  const b = await body<{ token: string }>(req);
  return handle(() => startTable(code, b.token));
}
