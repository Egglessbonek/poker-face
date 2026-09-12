import type { NextRequest } from "next/server";
import { body, handle } from "@/lib/game/http";
import { updateTells } from "@/lib/game/table";
import type { BaselineStats, TellFrame, TellVector } from "@/lib/types";

export const runtime = "nodejs";

/** POST { token, frame?, vector?, baseline? } — a human's browser streams its tells (~2Hz). */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/table/[code]/tells">) {
  const { code } = await ctx.params;
  const b = await body<{ token: string; frame?: TellFrame | null; vector?: TellVector | null; baseline?: BaselineStats }>(req);
  return handle(() => updateTells(code, b.token, { frame: b.frame, vector: b.vector, baseline: b.baseline }));
}
