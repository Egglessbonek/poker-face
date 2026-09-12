import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

/** GET ?agentId= -> { signedUrl } so the client can start a conversation without exposing the API key. */
export async function GET(req: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = req.nextUrl.searchParams.get("agentId") ?? process.env.ELEVENLABS_AGENT_ID;
  if (!apiKey || !agentId) return NextResponse.json({ error: "ELEVENLABS_API_KEY / agent id missing" }, { status: 500 });

  const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`, {
    headers: { "xi-api-key": apiKey },
  });
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status });
  const data = (await res.json()) as { signed_url: string };
  return NextResponse.json({ signedUrl: data.signed_url });
}
