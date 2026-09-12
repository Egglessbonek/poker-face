import { NextResponse, type NextRequest } from "next/server";
import { startMatch } from "@/lib/game/match";
import { getSession } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { sessionId } = (await req.json()) as { sessionId: string };
  if (!getSession(sessionId)) return NextResponse.json({ error: "unknown session" }, { status: 404 });
  return NextResponse.json(await startMatch(sessionId));
}
