import type { NextRequest } from "next/server";
import { body, handle } from "@/lib/game/http";
import { endTable } from "@/lib/game/table";

export const runtime = "nodejs";

/** POST { token } — host ends the match now; a hand in progress is voided and chips returned. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/table/[code]/end">) {
  const { code } = await ctx.params;
  const b = await body<{ token: string }>(req);
  return handle(() => endTable(code, b.token));
}
