/**
 * AI players are specific models (see lib/llm/models.ts). A persona is a model plus its table
 * presence: name, style, aggression, and the ElevenLabs voice from ELEVENLABS_VOICE_<ID>.
 */

import { AI_MODELS, getAIModel } from "@/lib/llm/models";
import type { Persona } from "@/lib/types";

function voiceFor(id: string): string | undefined {
  return process.env[`ELEVENLABS_VOICE_${id.toUpperCase()}`] || process.env.ELEVENLABS_VOICE_ID || undefined;
}

function modelFor(m: { id: string; openrouter: string }): string {
  return process.env[`OPENROUTER_MODEL_${m.id.toUpperCase()}`] || m.openrouter;
}

export const PERSONAS: Persona[] = AI_MODELS.map((m) => ({
  id: m.id,
  name: m.label,
  vendor: m.vendor,
  tagline: m.tagline,
  style: m.style,
  aggression: m.aggression,
  model: modelFor(m),
  voiceId: voiceFor(m.id),
}));

export function getPersona(id: string): Persona {
  const m = getAIModel(id) ?? AI_MODELS[0];
  return PERSONAS.find((p) => p.id === m.id) ?? PERSONAS[0];
}

export function isPersonaId(id: string): boolean {
  return !!getAIModel(id);
}
