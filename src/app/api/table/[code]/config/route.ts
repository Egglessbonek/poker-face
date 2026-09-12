import type { NextRequest } from "next/server";
import { body, handle } from "@/lib/game/http";
import { updateConfig } from "@/lib/game/table";
import type { TableConfig } from "@/lib/types";

export const runtime = "nodejs";

/** PATCH { token, config: Partial<TableConfig> } — host, lobby only. */
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/table/[code]/config">) {
  const { code } = await ctx.params;
  const b = await body<{ token: string; config: Partial<TableConfig> }>(req);
  return handle(() => updateConfig(code, b.token, b.config ?? {}));
}
