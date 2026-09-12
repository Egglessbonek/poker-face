import type { NextRequest } from "next/server";
import { body, handle } from "@/lib/game/http";
import { addAI, removePlayer } from "@/lib/game/table";

export const runtime = "nodejs";

/** POST { token, modelId } — host seats an OpenRouter model (lobby only). */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/table/[code]/ai">) {
  const { code } = await ctx.params;
  const b = await body<{ token: string; modelId: string }>(req);
  return handle(() => addAI(code, b.token, b.modelId));
}

/** DELETE { token, playerId } — host removes a player (lobby only). */
export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/table/[code]/ai">) {
  const { code } = await ctx.params;
  const b = await body<{ token: string; playerId: string }>(req);
  return handle(() => removePlayer(code, b.token, b.playerId));
}
