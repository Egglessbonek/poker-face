import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { completeJSON, llmDiagnostics } from "../provider";
vi.mock("server-only", () => ({}));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const opts = { system: "test", user: "test", schema: z.object({ ok: z.boolean() }), model: "test/model" };
describe("provider diagnostics", () => {
  it("distinguishes a configured key from authentication failure without exposing its response", async () => {
    vi.stubEnv("LLM_PROVIDER", "openrouter"); vi.stubEnv("OPENROUTER_API_KEY", "test-secret");
    const fetcher = vi.fn().mockResolvedValue(new Response('private provider response', { status: 401 }));
    vi.stubGlobal("fetch", fetcher);
    const before = llmDiagnostics();
    await expect(completeJSON(opts)).rejects.toThrow("HTTP 401");
    const after = llmDiagnostics();
    expect(after.configured).toBe(true);
    expect(after.failed).toBe(before.failed + 1);
    expect(after.succeeded).toBe(before.succeeded);
    expect(after.lastFailure).toMatchObject({ kind: "authentication", status: 401 });
    expect(JSON.stringify(after)).not.toMatch(/test-secret|private provider response/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("records a validated completion and honors the selected seat model", async () => {
    vi.stubEnv("LLM_PROVIDER", "openrouter"); vi.stubEnv("OPENROUTER_API_KEY", "test-secret");
    const fetcher = vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: '{"ok":true}' } }] }));
    vi.stubGlobal("fetch", fetcher);
    const before = llmDiagnostics();
    expect(await completeJSON(opts)).toEqual({ ok: true });
    expect(llmDiagnostics().succeeded).toBe(before.succeeded + 1);
    expect(JSON.parse(fetcher.mock.calls[0][1].body).model).toBe("test/model");
  });
});
