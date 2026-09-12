import { NextResponse } from "next/server";
import { getCatalog } from "@/lib/llm/catalog";
import { FEATURED_MODEL_IDS } from "@/lib/llm/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET -> { featured, all } : pinned ids plus OpenRouter's full live catalog. */
export async function GET() {
  const all = await getCatalog();
  return NextResponse.json({ featured: FEATURED_MODEL_IDS, all }, { headers: { "Cache-Control": "public, max-age=300" } });
}
