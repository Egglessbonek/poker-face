import type { NextRequest } from "next/server";
import { body, handle } from "@/lib/game/http";
import { joinTable } from "@/lib/game/table";

export const runtime = "nodejs";

/** POST { name } -> { playerId, token } */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/table/[code]/join">) {
  const { code } = await ctx.params;
  const b = await body<{ name?: string }>(req);
  return handle(() => joinTable(code, b.name ?? ""));
}
