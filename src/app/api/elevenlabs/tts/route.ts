import { NextResponse, type NextRequest } from "next/server";
import { ttsCache, ttsCacheKey } from "@/lib/ttsCache";

export const runtime = "nodejs";

/** Table talk is one or two short sentences; anything longer is not a line an AI seat said. */
const MAX_TEXT_CHARS = 400;

/**
 * POST { text, voiceId? } -> audio/mpeg. Every client at a table plays the same lines, so audio is cached by
 * (voice, text) and concurrent identical requests share one ElevenLabs call (`x-tts-cache: hit | miss`).
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ELEVENLABS_API_KEY missing" }, { status: 500 });
  const body = (await req.json().catch(() => null)) as { text?: unknown; voiceId?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length > MAX_TEXT_CHARS) return NextResponse.json({ error: "text must be 1-400 characters" }, { status: 400 });
  const voice = (typeof body?.voiceId === "string" && body.voiceId) || process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";

  try {
    const { bytes, hit } = await ttsCache().getOrProduce(ttsCacheKey(voice, text), async () => {
      const { ElevenLabsClient } = await import("@elevenlabs/elevenlabs-js");
      const client = new ElevenLabsClient({ apiKey });
      const audio = await client.textToSpeech.stream(voice, {
        text,
        modelId: process.env.ELEVENLABS_TTS_MODEL ?? "eleven_flash_v2_5",
        outputFormat: "mp3_44100_128",
      });
      return new Uint8Array(await new Response(audio).arrayBuffer());
    });
    return new Response(bytes, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=600", "x-tts-cache": hit ? "hit" : "miss" } });
  } catch (err) {
    console.error("tts: ElevenLabs call failed", err);
    return NextResponse.json({ error: "text-to-speech failed" }, { status: 502 });
  }
}
