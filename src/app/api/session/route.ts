import { NextResponse, type NextRequest } from "next/server";
import { appendLog, createSession, endSession, getSession, updateSession } from "@/lib/store";
import { closeChannel, openChannel } from "@/lib/rail/bus";
import { generateRailCode } from "@/lib/rail/code";
import type { BaselineStats, SessionLogEntry } from "@/lib/types";

export const runtime = "nodejs";

/** POST { personaId } -> new session + rail code. */
export async function POST(req: NextRequest) {
  const { personaId } = (await req.json()) as { personaId: string };
  const id = crypto.randomUUID();
  const railCode = generateRailCode();
  createSession({ id, railCode, personaId });
  openChannel(railCode, id);
  return NextResponse.json({ sessionId: id, railCode });
}

/** PATCH { sessionId, baseline?, log?: SessionLogEntry[], end?: boolean } */
export async function PATCH(req: NextRequest) {
  const body = (await req.json()) as { sessionId: string; baseline?: BaselineStats; log?: Array<Omit<SessionLogEntry, "t"> & { t?: number }>; end?: boolean };
  const s = getSession(body.sessionId);
  if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (body.baseline) updateSession(s.id, { baseline: body.baseline });
  for (const e of body.log ?? []) appendLog(s.id, e);
  if (body.end) {
    endSession(s.id);
    closeChannel(s.railCode);
  }
  return NextResponse.json({ ok: true });
}

/** GET ?id= -> full session (used by the reveal page). */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const s = id ? getSession(id) : undefined;
  if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(s);
}
