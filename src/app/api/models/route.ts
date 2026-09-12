import { NextResponse } from "next/server";
import { getCatalog } from "@/lib/llm/catalog";
import { AI_MODELS } from "@/lib/llm/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET -> { featured, all } : the curated opponents plus OpenRouter's full live catalog. */
export async function GET() {
  const all = await getCatalog();
  return NextResponse.json({ featured: AI_MODELS, all }, { headers: { "Cache-Control": "public, max-age=300" } });
}
