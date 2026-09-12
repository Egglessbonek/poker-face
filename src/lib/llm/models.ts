/**
 * The AI opponents you can seat: each one is a specific model, routed through OpenRouter.
 * Client-safe (no secrets). Override any OpenRouter id with OPENROUTER_MODEL_<ID> (e.g. OPENROUTER_MODEL_CHATGPT).
 */

export interface AIModel {
  /** Stable id used in table config and player.personaId. */
  id: string;
  /** Display name at the table. */
  label: string;
  vendor: string;
  /** Default OpenRouter model id. */
  openrouter: string;
  tagline: string;
  /** Prompt fragment: how this model tends to carry itself at the table. */
  style: string;
  /** 0-1: how often to bet/raise beyond what the math suggests. */
  aggression: number;
}

export const AI_MODELS: AIModel[] = [
  { id: "claude", label: "Claude", vendor: "Anthropic", openrouter: "anthropic/claude-sonnet-5", tagline: "Thoughtful. Notices everything. Apologizes for nothing.", style: "Warm but incisive, dry humor, precise about what it observed. Plays solid and picks its spots.", aggression: 0.45 },
  { id: "chatgpt", label: "ChatGPT", vendor: "OpenAI", openrouter: "openai/gpt-5.6-terra", tagline: "Confident, chatty, always has a take.", style: "Upbeat, conversational, a little cocky, fond of tidy summaries. Plays balanced and likes to apply pressure.", aggression: 0.55 },
  { id: "deepseek", label: "DeepSeek", vendor: "DeepSeek", openrouter: "deepseek/deepseek-v3.2", tagline: "Quiet. Efficient. Runs the numbers twice.", style: "Terse, analytical, unbothered. States the odds and moves on. Rarely bluffs; punishes bluffers.", aggression: 0.35 },
  { id: "gemini", label: "Gemini", vendor: "Google", openrouter: "google/gemini-3.8-flash", tagline: "Fast talker. Faster folder.", style: "Bright and quick, enthusiastic, throws in a fun fact. Plays loose-passive but wakes up with big hands.", aggression: 0.5 },
  { id: "grok", label: "Grok", vendor: "xAI", openrouter: "x-ai/grok-4.6", tagline: "Here to needle you.", style: "Irreverent, sarcastic, loves trash talk about your face. Aggressive; bluffs more than it should.", aggression: 0.75 },
  { id: "llama", label: "Llama", vendor: "Meta", openrouter: "meta-llama/llama-4-maverick", tagline: "Open-weights, open book.", style: "Friendly, plain-spoken, a bit earnest. Straightforward ABC poker.", aggression: 0.4 },
  { id: "mistral", label: "Mistral", vendor: "Mistral AI", openrouter: "mistralai/mistral-medium-3-5", tagline: "Cool as the wind it's named after.", style: "Elegant, understated, occasionally French. Patient, then sudden.", aggression: 0.5 },
  { id: "qwen", label: "Qwen", vendor: "Alibaba", openrouter: "qwen/qwen3.8-flash", tagline: "Polite until the river.", style: "Courteous and measured, compliments your play right before taking your chips. Tight-aggressive.", aggression: 0.55 },
  { id: "kimi", label: "Kimi", vendor: "Moonshot", openrouter: "moonshotai/kimi-k2.6", tagline: "Long memory. Remembers your last bluff.", style: "Calm, references earlier hands, patient trapper.", aggression: 0.45 },
];

export function getAIModel(id: string): AIModel | undefined {
  return AI_MODELS.find((m) => m.id === id);
}

export function isAIModelId(id: string): boolean {
  return AI_MODELS.some((m) => m.id === id);
}

// ---------- any OpenRouter model ----------

/** A model from OpenRouter's live catalog, trimmed for the picker. */
export interface CatalogModel {
  /** OpenRouter id, e.g. "openai/gpt-5.6-terra". Doubles as the seat id. */
  id: string;
  /** Display name without the vendor prefix, e.g. "GPT-5.6 Terra". */
  name: string;
  vendor: string;
  contextLength: number;
  /** USD per million tokens. */
  promptPerM: number;
  completionPerM: number;
}

const VENDOR_NAMES: Record<string, string> = {
  anthropic: "Anthropic", openai: "OpenAI", google: "Google", deepseek: "DeepSeek", "x-ai": "xAI", "meta-llama": "Meta", mistralai: "Mistral AI", qwen: "Alibaba", moonshotai: "Moonshot", cohere: "Cohere", perplexity: "Perplexity", nvidia: "NVIDIA", microsoft: "Microsoft", amazon: "Amazon", "z-ai": "Z.ai", minimax: "MiniMax", baidu: "Baidu", tencent: "Tencent", bytedance: "ByteDance",
};

const OPENROUTER_ID = /^[a-z0-9][a-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._:-]*$/;

/** True for anything that can be seated: a curated id or a plausible OpenRouter model id. */
export function isSeatableModelId(id: string): boolean {
  return isAIModelId(id) || OPENROUTER_ID.test(id);
}

/** Human-readable label and vendor for an arbitrary OpenRouter id, without the catalog. */
export function describeModelId(id: string): { label: string; vendor: string } {
  const curated = getAIModel(id);
  if (curated) return { label: curated.label, vendor: curated.vendor };
  const [prefix, rest = id] = id.split("/");
  const vendor = VENDOR_NAMES[prefix] ?? prefix.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const label = rest
    .replace(/:.*$/, "")
    .split("-")
    .map((w) => (/^\d/.test(w) || w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
  return { label, vendor };
}

/** Normalize one record from GET https://openrouter.ai/api/v1/models. Returns null for non-text models. */
export function toCatalogModel(raw: { id: string; name?: string; context_length?: number; architecture?: { output_modalities?: string[] }; pricing?: { prompt?: string; completion?: string } }): CatalogModel | null {
  if (!raw.id || !OPENROUTER_ID.test(raw.id)) return null;
  if (raw.architecture?.output_modalities && !raw.architecture.output_modalities.includes("text")) return null;
  if (raw.id.endsWith(":batch")) return null;
  const { label, vendor } = describeModelId(raw.id);
  const fullName = raw.name ?? "";
  const name = fullName.includes(": ") ? fullName.slice(fullName.indexOf(": ") + 2) : fullName || label;
  const perM = (s?: string) => Math.round(Number(s ?? 0) * 1e6 * 100) / 100;
  return { id: raw.id, name, vendor, contextLength: raw.context_length ?? 0, promptPerM: perM(raw.pricing?.prompt), completionPerM: perM(raw.pricing?.completion) };
}
