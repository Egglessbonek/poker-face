import type { NextRequest } from "next/server";
import { body, handle } from "@/lib/game/http";
import { updateVisibility } from "@/lib/game/table";

export const runtime = "nodejs";

/** PATCH { token, isPublic } — host, lobby only. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const input = await body<{ token: string; isPublic: boolean }>(req);
  return handle(() => updateVisibility(code, input.token, input.isPublic));
}
