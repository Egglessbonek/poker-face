import { NextResponse, type NextRequest } from "next/server";
import { nextHand } from "@/lib/game/match";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { sessionId } = (await req.json()) as { sessionId: string };
  try {
    return NextResponse.json(await nextHand(sessionId));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
