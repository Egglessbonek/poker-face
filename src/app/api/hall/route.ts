import { NextResponse } from "next/server";
import { getHall } from "@/lib/hall";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET -> the best poker faces from matches finished since the server started. */
export async function GET() {
  return NextResponse.json({ entries: getHall(10) });
}
