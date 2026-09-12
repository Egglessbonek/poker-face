/**
 * Provider-agnostic structured completion. Server only.
 * Set LLM_PROVIDER=gemini | anthropic. Returns parsed JSON validated by the caller's zod schema.
 */

import "server-only";
import { z } from "zod";

export type Provider = "gemini" | "anthropic";

export function currentProvider(): Provider {
  const p = process.env.LLM_PROVIDER ?? "gemini";
  if (p !== "gemini" && p !== "anthropic") throw new Error(`Unknown LLM_PROVIDER: ${p}`);
  return p;
}

/** True when the configured provider has a key. Lets callers skip the LLM cleanly in local dev. */
export function llmAvailable(): boolean {
  try {
    return currentProvider() === "anthropic" ? !!process.env.ANTHROPIC_API_KEY : !!process.env.GEMINI_API_KEY;
  } catch {
    return false;
  }
}

export interface CompleteOptions<T> {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
  temperature?: number;
}

export async function completeJSON<T>(opts: CompleteOptions<T>): Promise<T> {
  const raw = currentProvider() === "anthropic" ? await anthropicText(opts) : await geminiText(opts);
  const json = extractJSON(raw);
  return opts.schema.parse(json);
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
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error(`No JSON object in LLM output: ${text.slice(0, 200)}`);
  return JSON.parse(candidate.slice(start, end + 1));
}
