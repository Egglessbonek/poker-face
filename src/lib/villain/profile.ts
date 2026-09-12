/**
 * Who an AI seat is: the model's own name and vendor from OpenRouter's catalog, plus the ElevenLabs
 * voice configured for it. No invented personality; the model speaks for itself.
 */

import { cachedCatalogModel, getCatalog } from "@/lib/llm/catalog";
import { describeModelId } from "@/lib/llm/models";
import type { ModelProfile } from "@/lib/types";

function envKey(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

/** ELEVENLABS_VOICE_<MODEL ID> > ELEVENLABS_VOICE_<VENDOR> > ELEVENLABS_VOICE_ID. */
function voiceFor(id: string, vendor: string): string | undefined {
  return process.env[`ELEVENLABS_VOICE_${envKey(id)}`] || process.env[`ELEVENLABS_VOICE_${envKey(vendor)}`] || process.env.ELEVENLABS_VOICE_ID || undefined;
}

/** Synchronous, from the cached catalog (falls back to the id itself). */
export function getProfile(id: string): ModelProfile {
  const fromCatalog = cachedCatalogModel(id);
  const derived = describeModelId(id);
  const vendor = fromCatalog?.vendor ?? derived.vendor;
  return { id, name: fromCatalog?.name ?? derived.label, vendor, voiceId: voiceFor(id, vendor) };
}

/** Same, after making sure the catalog has been fetched at least once. */
export async function resolveProfile(id: string): Promise<ModelProfile> {
  await getCatalog();
  return getProfile(id);
}
