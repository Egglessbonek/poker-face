/**
 * Who an AI seat is: the model's own name and vendor from OpenRouter's catalog, plus the ElevenLabs
 * voice it would prefer (see voices.ts; the table dedupes per seat). No invented personality; the model speaks for itself.
 */

import { cachedCatalogModel, getCatalog } from "@/lib/llm/catalog";
import { describeModelId } from "@/lib/llm/models";
import type { ModelProfile } from "@/lib/types";
import { preferredVoice } from "./voices";

/** Synchronous, from the cached catalog (falls back to the id itself). */
export function getProfile(id: string): ModelProfile {
  const fromCatalog = cachedCatalogModel(id);
  const derived = describeModelId(id);
  const vendor = fromCatalog?.vendor ?? derived.vendor;
  return { id, name: fromCatalog?.name ?? derived.label, vendor, voiceId: preferredVoice(id, vendor) };
}

/** Same, after making sure the catalog has been fetched at least once. */
export async function resolveProfile(id: string): Promise<ModelProfile> {
  await getCatalog();
  return getProfile(id);
}
