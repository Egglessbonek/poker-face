import { NextResponse } from "next/server";
import { getTableLog } from "@/lib/game/table";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET -> the full table log (feeds the reveal). */
export async function GET(_req: Request, ctx: RouteContext<"/api/table/[code]/log">) {
  const { code } = await ctx.params;
  const log = getTableLog(code);
  if (!log) return NextResponse.json({ error: "No such table" }, { status: 404 });
  return NextResponse.json(log);
}
