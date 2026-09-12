import { NextResponse } from "next/server";
import { currentProvider, llmAvailable } from "@/lib/llm/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET -> liveness for the host's health check, plus which integrations are configured. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    uptimeSec: Math.round(process.uptime()),
    llm: llmAvailable(),
    provider: (() => {
      try {
        return currentProvider();
      } catch {
        return "invalid";
      }
    })(),
    voice: !!process.env.ELEVENLABS_API_KEY,
  });
}
