import type { NextRequest } from "next/server";
import { body, handle } from "@/lib/game/http";
import { rematchTable } from "@/lib/game/table";

export const runtime = "nodejs";

/** POST { token } — host reopens a finished table with the same config and AI seats -> { code, playerId, token } */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/table/[code]/rematch">) {
  const { code } = await ctx.params;
  const b = await body<{ token: string }>(req);
  return handle(() => rematchTable(code, b.token));
}
