import { NextResponse, type NextRequest } from "next/server";
import { hasChannel, publish, subscribe } from "@/lib/rail/bus";
import { isValidRailCode } from "@/lib/rail/code";
import type { RailEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET: Server-Sent Events stream for spectators. Replays last state on connect, heartbeats every 15s. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/rail/[code]">) {
  const { code } = await ctx.params;
  if (!isValidRailCode(code) || !hasChannel(code)) return new NextResponse("No such table", { status: 404 });

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (ev: RailEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
      unsubscribe = subscribe(code, send);
      heartbeat = setInterval(() => controller.enqueue(encoder.encode(`: ping\n\n`)), 15_000);
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}

/** POST: the playing client publishes events to its rail. TODO: authenticate with a session token. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/rail/[code]">) {
  const { code } = await ctx.params;
  const event = (await req.json()) as RailEvent;
  const ok = publish(code, event);
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}
