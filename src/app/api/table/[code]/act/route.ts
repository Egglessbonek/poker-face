import type { NextRequest } from "next/server";
import { body, handle } from "@/lib/game/http";
import { act } from "@/lib/game/table";
import type { ActionType, TellVector } from "@/lib/types";

export const runtime = "nodejs";

/** POST { token, type, amount?, latencyMs?, tells? } */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/table/[code]/act">) {
  const { code } = await ctx.params;
  const b = await body<{ token: string; type: ActionType; amount?: number; latencyMs?: number; tells?: TellVector | null }>(req);
  return handle(() => act(code, b.token, { type: b.type, amount: b.amount, latencyMs: b.latencyMs }, b.tells ?? null));
}
