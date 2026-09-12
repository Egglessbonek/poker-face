import { describe, expect, it } from "vitest";
import { SIGNATURE_VOICE, VOICE_POOL, pickVoice, preferredVoice } from "../voices";

const noEnv: Record<string, string | undefined> = {};

describe("voices", () => {
  it("pool ids are unique", () => {
    expect(new Set(VOICE_POOL.map((v) => v.id)).size).toBe(VOICE_POOL.length);
  });
  it("signature voices are distinct and come from the pool", () => {
    const ids = Object.values(SIGNATURE_VOICE);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(VOICE_POOL.some((v) => v.id === id)).toBe(true);
  });
  it("a provider gets its signature voice at an empty table", () => {
    expect(pickVoice("anthropic/claude-sonnet-5", "Anthropic", [], noEnv)).toBe(SIGNATURE_VOICE.anthropic);
    expect(pickVoice("openai/gpt-5.6-terra", "OpenAI", [], noEnv)).toBe(SIGNATURE_VOICE.openai);
  });
  it("the same provider seated twice never shares a voice", () => {
    const a = pickVoice("anthropic/claude-sonnet-5", "Anthropic", [], noEnv);
    const b = pickVoice("anthropic/claude-sonnet-5", "Anthropic", [a], noEnv);
    expect(b).not.toBe(a);
    expect(b).toBe(VOICE_POOL.find((v) => v.id !== a)!.id);
  });
  it("nine seats of one provider are all distinct", () => {
    const taken: string[] = [];
    for (let i = 0; i < 9; i++) taken.push(pickVoice("x-ai/grok-4.6", "xAI", taken, noEnv));
    expect(new Set(taken).size).toBe(9);
  });
  it("a custom model with no signature still gets a distinct pool voice", () => {
    const taken = [SIGNATURE_VOICE.anthropic, VOICE_POOL[1].id];
    const v = pickVoice("cohere/command-a", "Cohere", taken, noEnv);
    expect(taken).not.toContain(v);
  });
  it("env overrides win, most specific first, and still dedupe", () => {
    const env = { ELEVENLABS_VOICE_ANTHROPIC: "VOICE_A", ELEVENLABS_VOICE_ANTHROPIC_CLAUDE_SONNET_5: "VOICE_M" };
    expect(preferredVoice("anthropic/claude-sonnet-5", "Anthropic", env)).toBe("VOICE_M");
    expect(preferredVoice("anthropic/claude-opus-5", "Anthropic", env)).toBe("VOICE_A");
    expect(pickVoice("anthropic/claude-opus-5", "Anthropic", ["VOICE_A"], env)).toBe(VOICE_POOL[0].id);
  });
});
