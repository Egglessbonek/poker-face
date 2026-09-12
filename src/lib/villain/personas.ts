/**
 * AI players are LLMs. A persona is a model plus its table presence: name, style, aggression, and
 * the ElevenLabs voice from ELEVENLABS_VOICE_<ID>. Curated seats (lib/llm/models.ts) carry a written
 * style; any other OpenRouter id gets a generic "play as yourself" presence.
 */

import { cachedCatalogModel } from "@/lib/llm/catalog";
import { AI_MODELS, describeModelId, getAIModel, isSeatableModelId } from "@/lib/llm/models";
import type { Persona } from "@/lib/types";

function envKey(id: string): string {
  return id.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

function voiceFor(id: string, vendor: string): string | undefined {
  return process.env[`ELEVENLABS_VOICE_${envKey(id)}`] || process.env[`ELEVENLABS_VOICE_${envKey(vendor)}`] || process.env.ELEVENLABS_VOICE_ID || undefined;
}

export const PERSONAS: Persona[] = AI_MODELS.map((m) => ({
  id: m.id,
  name: m.label,
  vendor: m.vendor,
  tagline: m.tagline,
  style: m.style,
  aggression: m.aggression,
  model: process.env[`OPENROUTER_MODEL_${envKey(m.id)}`] || m.openrouter,
  voiceId: voiceFor(m.id, m.vendor),
}));

export function getPersona(id: string): Persona {
  const curated = getAIModel(id);
  if (curated) return PERSONAS.find((p) => p.id === curated.id) ?? PERSONAS[0];
  if (!isSeatableModelId(id)) return PERSONAS[0];
  const fromCatalog = cachedCatalogModel(id);
  const { label, vendor } = describeModelId(id);
  const name = fromCatalog?.name ?? label;
  return {
    id,
    name,
    vendor: fromCatalog?.vendor ?? vendor,
    tagline: `${fromCatalog?.vendor ?? vendor} · ${id}`,
    style: "Play as yourself: whatever voice, humor, and temperament you naturally have. Keep table talk short.",
    aggression: 0.5,
    model: id,
    voiceId: voiceFor(id, fromCatalog?.vendor ?? vendor),
  };
}

export function isPersonaId(id: string): boolean {
  return isSeatableModelId(id);
}
