/**
 * Which ElevenLabs voice an AI seat speaks with. Every provider has a signature voice so you can tell
 * the models apart; when a table seats the same provider twice, the second seat takes the next unused
 * voice from the pool, so no two seats at one table ever share a voice. Env vars still override:
 * ELEVENLABS_VOICE_<MODEL ID> > ELEVENLABS_VOICE_<VENDOR> > signature > pool.
 *
 * Ids are ElevenLabs premade voices (free on every account); a voice id is not a secret.
 */

export interface Voice {
  id: string;
  name: string;
}

/** Ordered for variety: alternating gender and accent so neighbours in the pool sound different. */
export const VOICE_POOL: Voice[] = [
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George" },
  { id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura" },
  { id: "cjVigY5qzO86Huf0OWal", name: "Eric" },
  { id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily" },
  { id: "N2lVS1w4EtoT3dr4eOWO", name: "Callum" },
  { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda" },
  { id: "SAz9YHcvj6GT2YYXdXww", name: "River" },
  { id: "iP95p4xoKVk53GoZ742B", name: "Chris" },
  { id: "pqHfZKP75CvOlQylNhV4", name: "Bill" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah" },
  { id: "IKne3meq5aSn9XLyUdCD", name: "Charlie" },
  { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice" },
  { id: "CwhRBWXzGAHq8TQ4Fs17", name: "Roger" },
  { id: "cgSgspJ2msm6clMCkdW9", name: "Jessica" },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel" },
  { id: "hpp4J3VqNfWAUOO0d1Us", name: "Bella" },
  { id: "bIHbv24MWmeRgasZH58o", name: "Will" },
  { id: "nPczCjzI2devNBz1zQrb", name: "Brian" },
  { id: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam" },
  { id: "SOYHLrjzK2X1ezoPC6cr", name: "Harry" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam" },
];

/** Signature voice per OpenRouter vendor prefix (the part before the slash in a model id). */
export const SIGNATURE_VOICE: Record<string, string> = {
  anthropic: "JBFqnCBsd6RMkjVDRZzb", // George
  openai: "cjVigY5qzO86Huf0OWal", // Eric
  "x-ai": "N2lVS1w4EtoT3dr4eOWO", // Callum
  google: "FGY2WhTYpPnrIDTdsKH5", // Laura
  deepseek: "SAz9YHcvj6GT2YYXdXww", // River
  "meta-llama": "iP95p4xoKVk53GoZ742B", // Chris
  mistralai: "pFZP5JQG7iQjIQuC4Bku", // Lily
  qwen: "XrExE9yKIg1WjnnlVkGX", // Matilda
  moonshotai: "pqHfZKP75CvOlQylNhV4", // Bill
};

function envKey(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

/** The voice a model would get at an empty table: env override, else its vendor's signature, else the first pool voice. */
export function preferredVoice(modelId: string, vendor: string, env: Record<string, string | undefined> = process.env): string {
  const prefix = modelId.split("/")[0];
  return env[`ELEVENLABS_VOICE_${envKey(modelId)}`] || env[`ELEVENLABS_VOICE_${envKey(vendor)}`] || env[`ELEVENLABS_VOICE_${envKey(prefix)}`] || SIGNATURE_VOICE[prefix] || env.ELEVENLABS_VOICE_ID || VOICE_POOL[0].id;
}

/** Pick a voice for a new seat that no one in `taken` already uses. Falls back through the pool; only repeats when the pool is exhausted. */
export function pickVoice(modelId: string, vendor: string, taken: Iterable<string>, env: Record<string, string | undefined> = process.env): string {
  const used = new Set(taken);
  const first = preferredVoice(modelId, vendor, env);
  if (!used.has(first)) return first;
  for (const v of VOICE_POOL) if (!used.has(v.id)) return v.id;
  return first;
}

export function voiceName(id: string | undefined): string | undefined {
  return VOICE_POOL.find((v) => v.id === id)?.name;
}
