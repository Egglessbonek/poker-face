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
