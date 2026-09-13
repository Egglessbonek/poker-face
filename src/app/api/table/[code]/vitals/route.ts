import type { NextRequest } from "next/server";
import { getState, getTableLog, resolveViewer, TableError } from "@/lib/game/table";
import { readVitals, startVitals, stopVitals, pushVitals, updateVitalsContext, VitalsError } from "@/lib/presage/server";
import { MAX_BATCH_BYTES } from "@/lib/presage/protocol";
import type { Action, TableState } from "@/lib/types";
import type { CaptureContext, PressureEvent } from "@/lib/presage/types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = RouteContext<"/api/table/[code]/vitals">;
async function identity(req: NextRequest, ctx: Context) {
  const { code } = await ctx.params;
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? null;
  const viewer = resolveViewer(code, token);
  if (viewer.kind !== "player") throw new TableError("Your player identity is required", 401);
  return { code, playerId: viewer.playerId, state: getState(code, viewer) };
}
async function handle(run: () => unknown | Promise<unknown>) {
  try { return Response.json(await run(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) {
    const known = error instanceof VitalsError || error instanceof TableError;
    return Response.json({ error: known ? error.message : "Camera measurement request failed", retryable: error instanceof VitalsError && error.retryable }, { status: known ? error.status : 400 });
  }
}
function events(code: string, state: TableState): PressureEvent[] {
  return (getTableLog(code)?.entries ?? []).flatMap<PressureEvent>(entry => {
    const data = entry.data as { handNumber?: number; playerId?: string; action?: Action };
    const handNumber = data.handNumber ?? 0;
    if (entry.kind === "hand_start") return [{ at: entry.t, handNumber, kind: "start", label: `Hand ${handNumber} dealt` }];
    if (entry.kind === "hand_end") return [{ at: entry.t, handNumber, kind: "end", label: `Hand ${handNumber} ended` }];
    if (entry.kind === "action" && data.action) {
      const name = state.players.find(p => p.id === data.playerId)?.name ?? "Player";
      return [{ at: entry.t, handNumber, kind: "action", playerId: data.playerId, latencyMs: data.action.latencyMs, label: `${data.action.street}: ${name} ${data.action.type}${data.action.amount ? ` ${data.action.amount}` : ""}` }];
    }
    return [];
  });
}
export async function GET(req: NextRequest, ctx: Context) { return handle(async () => {
  const { code, playerId, state } = await identity(req, ctx);
  updateVitalsContext(code, playerId, events(code, state));
  return readVitals(code, playerId, req.nextUrl.searchParams.get("history") === "1");
}); }
export async function POST(req: NextRequest, ctx: Context) { return handle(async () => {
  const { code, playerId, state } = await identity(req, ctx);
  if (state.phase === "finished" || state.players.find(p => p.id === playerId)?.sittingOut) throw new TableError("You have left this game", 409);
  startVitals(code, playerId);
  return readVitals(code, playerId);
}); }
export async function PUT(req: NextRequest, ctx: Context) { return handle(async () => {
  const { code, playerId, state } = await identity(req, ctx);
  if (state.phase === "finished" || state.players.find(p => p.id === playerId)?.sittingOut) { stopVitals(code, playerId); throw new TableError("Game no longer active", 409); }
  const reader = req.body?.getReader();
  if (!reader) throw new VitalsError("No camera frames");
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > MAX_BATCH_BYTES) { await reader.cancel(); throw new VitalsError("Camera upload is too large", 413); }
    chunks.push(value);
  }
  const data = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
  let context: CaptureContext | undefined;
  const hint = req.headers.get("x-vitals-context");
  if (hint && hint.length <= 256) {
    try { const parsed = JSON.parse(hint); if (typeof parsed.at === "number" && typeof parsed.mouthMoving === "boolean") context = { at: parsed.at, mouthMoving: parsed.mouthMoving }; } catch { /* Optional artifact hint; malformed hints never prevent capture. */ }
  }
  pushVitals(code, playerId, req.headers.get("x-vitals-session") ?? "", data, state.handNumber, events(code, state), context);
  return readVitals(code, playerId);
}); }
export async function DELETE(req: NextRequest, ctx: Context) { return handle(async () => {
  const { code, playerId } = await identity(req, ctx);
  stopVitals(code, playerId, req.headers.get("x-vitals-session") ?? undefined, req.nextUrl.searchParams.get("erase") === "1");
  return readVitals(code, playerId, true);
}); }
