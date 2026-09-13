import type { NextRequest } from "next/server";
import { body, handle } from "@/lib/game/http";
import { createTable } from "@/lib/game/table";
import type { TableConfig } from "@/lib/types";

export const runtime = "nodejs";

/** POST { config?: Partial<TableConfig>, name, isPublic?: boolean } -> { code, playerId, token } */
export async function POST(req: NextRequest) {
  const b = await body<{ config?: Partial<TableConfig>; name?: string; isPublic?: boolean }>(req);
  return handle(() => createTable(b.config ?? {}, b.name ?? "", b.isPublic));
}
