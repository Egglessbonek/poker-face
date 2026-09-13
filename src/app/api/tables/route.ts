import { NextResponse } from "next/server";
import { listOpenTables } from "@/lib/game/table";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET -> public tables in play or filling up, for the landing page's browse card. */
export async function GET() {
  return NextResponse.json({ tables: listOpenTables() }, { headers: { "Cache-Control": "no-store" } });
}
