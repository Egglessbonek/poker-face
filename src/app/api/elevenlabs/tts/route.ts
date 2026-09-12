import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

/**
 * POST { text, voiceId? } -> audio/mpeg stream.
 * Fallback path for villain table talk when the player denies microphone access
 * (the conversational agent needs a mic; plain TTS does not).
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ELEVENLABS_API_KEY missing" }, { status: 500 });
  const { text, voiceId } = (await req.json()) as { text: string; voiceId?: string };
  const voice = voiceId ?? process.env.ELEVENLABS_VOICE_ID ?? "JBFqnCBsd6RMkjVDRZzb";

  const { ElevenLabsClient } = await import("@elevenlabs/elevenlabs-js");
  const client = new ElevenLabsClient({ apiKey });
  const audio = await client.textToSpeech.stream(voice, {
    text,
    modelId: process.env.ELEVENLABS_TTS_MODEL ?? "eleven_flash_v2_5",
    outputFormat: "mp3_44100_128",
  });
  return new Response(audio, { headers: { "Content-Type": "audio/mpeg" } });
}
