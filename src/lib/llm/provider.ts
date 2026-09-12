/**
 * Provider-agnostic structured completion. Server only.
 * LLM_PROVIDER = openrouter (default when OPENROUTER_API_KEY is set) | gemini | anthropic.
 * With OpenRouter, each call names its model so every AI seat can be a different LLM.
 * Returns parsed JSON validated by the caller's zod schema.
 */

import "server-only";
import { z } from "zod";

export type Provider = "openrouter" | "gemini" | "anthropic";

const TIMEOUT_MS = 25_000;

export function currentProvider(): Provider {
  const p = process.env.LLM_PROVIDER ?? (process.env.OPENROUTER_API_KEY ? "openrouter" : "gemini");
  if (p !== "openrouter" && p !== "gemini" && p !== "anthropic") throw new Error(`Unknown LLM_PROVIDER: ${p}`);
  return p;
}

/** True when the configured provider has a key. Lets callers skip the LLM cleanly in local dev. */
export function llmAvailable(): boolean {
  try {
    const p = currentProvider();
    if (p === "openrouter") return !!process.env.OPENROUTER_API_KEY;
    if (p === "anthropic") return !!process.env.ANTHROPIC_API_KEY;
    return !!process.env.GEMINI_API_KEY;
  } catch {
    return false;
  }
}

/** Whether the per-seat model choice is honored (only OpenRouter routes to arbitrary models). */
export function perSeatModels(): boolean {
  try {
    return currentProvider() === "openrouter";
  } catch {
    return false;
  }
}

export interface CompleteOptions<T> {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  /** OpenRouter model id (ignored by the gemini/anthropic providers). */
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export async function completeJSON<T>(opts: CompleteOptions<T>): Promise<T> {
  const p = currentProvider();
  const run = async () => {
    const raw = p === "openrouter" ? await openrouterText(opts) : p === "anthropic" ? await anthropicText(opts) : await geminiText(opts);
    return opts.schema.parse(extractJSON(raw));
  };
  try {
    return await run();
  } catch (err) {
    // Empty or truncated output is usually transient (reasoning ate the budget); one retry is cheap.
    if (/empty response|No JSON object/.test((err as Error).message)) return run();
    throw err;
  }
}

async function openrouterText(opts: CompleteOptions<unknown>): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY missing");
  const model = opts.model ?? process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-5";
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_URL ?? "http://localhost:3000",
      "X-Title": "Poker Face",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 1200,
      // Keep hidden reasoning short so it does not consume the output budget; ignored by non-reasoning models.
      reasoning: { effort: "low" },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`OpenRouter ${model}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string | Array<{ type: string; text?: string }> } }>; error?: { message?: string } };
  if (data.error) throw new Error(`OpenRouter ${model}: ${data.error.message}`);
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) return content;
  if (Array.isArray(content)) return content.map((c) => c.text ?? "").join("");
  throw new Error(`OpenRouter ${model}: empty response`);
}

async function geminiText(opts: CompleteOptions<unknown>): Promise<string> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY missing");
  const model = new GoogleGenerativeAI(key).getGenerativeModel({
    model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
    systemInstruction: opts.system,
    generationConfig: { responseMimeType: "application/json", maxOutputTokens: opts.maxTokens ?? 512, temperature: opts.temperature ?? 0.7 },
  });
  const res = await model.generateContent(opts.user);
  return res.response.text();
}

async function anthropicText(opts: CompleteOptions<unknown>): Promise<string> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY missing");
  const client = new Anthropic({ apiKey: key });
  const res = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
    max_tokens: opts.maxTokens ?? 512,
    temperature: opts.temperature ?? 0.7,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  });
  return res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
}

function extractJSON(text: string): unknown {
  // Reasoning models may prepend <think>...</think>.
  const stripped = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  const fenced = stripped.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : stripped;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error(`No JSON object in LLM output: ${text.slice(0, 200)}`);
  return JSON.parse(candidate.slice(start, end + 1));
}
