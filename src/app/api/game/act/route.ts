import { NextResponse, type NextRequest } from "next/server";
import { heroAct } from "@/lib/game/match";
import type { ActionType, TellVector } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { sessionId: string; type: ActionType; amount?: number; latencyMs?: number; tells?: TellVector | null };
  try {
    return NextResponse.json(await heroAct(body.sessionId, { type: body.type, amount: body.amount, latencyMs: body.latencyMs }, body.tells ?? null));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
