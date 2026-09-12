import { NextResponse, type NextRequest } from "next/server";
import { getMatch, toPublic } from "@/lib/game/match";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId") ?? "";
  const m = getMatch(sessionId);
  if (!m) return NextResponse.json({ error: "no match" }, { status: 404 });
  return NextResponse.json({ state: toPublic(m), villainDecisions: [] });
}
