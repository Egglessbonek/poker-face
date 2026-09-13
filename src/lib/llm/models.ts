/**
 * AI opponents are OpenRouter models, identified by their OpenRouter id (e.g. "openai/gpt-5.6-terra").
 * Nothing here invents a personality: names and vendors come from OpenRouter's catalog, and each
 * model is prompted to play as itself. Client-safe (no secrets).
 */

/** A model from OpenRouter's live catalog, trimmed for the picker. */
export interface CatalogModel {
  /** OpenRouter id. Doubles as the seat id in table config. */
  id: string;
  /** Display name as OpenRouter lists it, without the vendor prefix, e.g. "Claude Sonnet 5". */
  name: string;
  vendor: string;
  contextLength: number;
  /** USD per million tokens. */
  promptPerM: number;
  completionPerM: number;
}

export interface CatalogProviderGroup {
  provider: string;
  models: CatalogModel[];
}

/** Alphabetical provider sections for the lobby catalog. Does not mutate the API response. */
export function groupCatalogByProvider(models: CatalogModel[]): CatalogProviderGroup[] {
  const byProvider = new Map<string, CatalogModel[]>();
  for (const model of models) {
    const group = byProvider.get(model.vendor) ?? [];
    group.push(model);
    byProvider.set(model.vendor, group);
  }
  return [...byProvider.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([provider, providerModels]) => ({ provider, models: [...providerModels].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)) }));
}

/** Shortcuts pinned at the top of the picker. Just ids; everything about them comes from the catalog. */
export const FEATURED_MODEL_IDS: string[] = [
  "anthropic/claude-sonnet-5",
  "openai/gpt-5.6-terra",
  "x-ai/grok-4.6",
  "meta-llama/llama-4-maverick",
  "google/gemini-3.8-flash",
  "deepseek/deepseek-v3.2",
];

export type TierId = "casual" | "pro";

/**
 * Difficulty tiers are a game mechanic: a tier describes how a seat plays (speed, cost, strength),
 * never who it is. The models still play as themselves. Presets seat the first three ids of a tier.
 */
export interface Tier {
  id: TierId;
  label: string;
  blurb: string;
  modelIds: string[];
}

export const TIERS: Tier[] = [
  {
    id: "casual",
    label: "Casual table",
    blurb: "Quick, cheap, chatty. Good for a first sit-down.",
    modelIds: ["google/gemini-3.8-flash", "deepseek/deepseek-v3.2", "meta-llama/llama-4-maverick", "qwen/qwen3.8-flash"],
  },
  {
    id: "pro",
    label: "Pro table",
    blurb: "Frontier models. Sharper reads, slower to act.",
    modelIds: ["anthropic/claude-sonnet-5", "openai/gpt-5.6-terra", "x-ai/grok-4.6", "moonshotai/kimi-k2.6"],
  },
];

/** The tier a model sits in, if any. Most of the catalog is in neither. */
export function tierOf(modelId: string): TierId | undefined {
  return TIERS.find((tier) => tier.modelIds.includes(modelId))?.id;
}

/** Expected response pace for lobby comparison. This is a product tier, not measured live latency. */
export function modelSpeed(modelId: string): "Fast" | "Standard" | "Deliberate" {
  const tier = tierOf(modelId);
  if (tier === "casual") return "Fast";
  if (tier === "pro") return "Deliberate";
  return "Standard";
}

const VENDOR_NAMES: Record<string, string> = {
  anthropic: "Anthropic", openai: "OpenAI", google: "Google", deepseek: "DeepSeek", "x-ai": "xAI", "meta-llama": "Meta", mistralai: "Mistral AI", qwen: "Alibaba", moonshotai: "Moonshot", cohere: "Cohere", perplexity: "Perplexity", nvidia: "NVIDIA", microsoft: "Microsoft", amazon: "Amazon", "z-ai": "Z.ai", minimax: "MiniMax", baidu: "Baidu", tencent: "Tencent", bytedance: "ByteDance",
};

export const OPENROUTER_ID = /^[a-z0-9][a-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._:-]*$/;

/** True for anything shaped like an OpenRouter model id. Existence is checked by OpenRouter at call time. */
export function isSeatableModelId(id: string): boolean {
  return OPENROUTER_ID.test(id);
}

/** Label and vendor derived from the id alone, for when the catalog is not loaded. */
export function describeModelId(id: string): { label: string; vendor: string } {
  const [prefix, rest = id] = id.split("/");
  const vendor = VENDOR_NAMES[prefix] ?? prefix.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const label = rest
    .replace(/:.*$/, "")
    .split("-")
    .map((w) => (/^\d/.test(w) || w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
  return { label, vendor };
}

/** Normalize one record from GET https://openrouter.ai/api/v1/models. Returns null for non-text or batch models. */
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

export function formatPrice(m: CatalogModel): string {
  if (m.promptPerM === 0 && m.completionPerM === 0) return "free";
  return `$${m.promptPerM} in · $${m.completionPerM} out /M`;
}
