import { NextResponse, type NextRequest } from "next/server";
import { getState, resolveViewer, setConnected, tableExists, TableError, visibleTells } from "@/lib/game/table";
import { subscribe } from "@/lib/realtime/bus";
import { isValidCode } from "@/lib/rail/code";
import type { TableEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET ?token= : Server-Sent Events. With a player token the stream carries that player's view (own
 * hole cards); without one it is the rail view (all cards, tells per table config).
 * Sends the current state immediately, then live events. Heartbeats every 15s.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/table/[code]/stream">) {
  const { code } = await ctx.params;
  if (!isValidCode(code) || !tableExists(code)) return new NextResponse("No such table", { status: 404 });
  const token = req.nextUrl.searchParams.get("token");
  let viewer;
  try {
    viewer = resolveViewer(code, token);
  } catch (err) {
    return new NextResponse((err as Error).message, { status: err instanceof TableError ? err.status : 400 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  const playerId = viewer.kind === "player" ? viewer.playerId : null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (ev: TableEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
      unsubscribe = subscribe(code, viewer, send);
      if (playerId) setConnected(code, playerId);
      send({ type: "state", state: getState(code, viewer) });
      for (const [pid, tells] of Object.entries(visibleTells(code, viewer))) send({ type: "tells", playerId: pid, tells });
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          /* closed */
        }
      }, 15_000);
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
      if (playerId) setConnected(code, playerId);
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
