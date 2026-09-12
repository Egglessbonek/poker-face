import { describe, expect, it } from "vitest";
import { TtsCache, ttsCacheKey } from "@/lib/ttsCache";

const bytes = (n: number) => new Uint8Array(new ArrayBuffer(1)).fill(n);

describe("tts cache", () => {
  it("keys on voice and normalized text", () => {
    expect(ttsCacheKey("v1", "  Nice   hand. ")).toBe(ttsCacheKey("v1", "Nice hand."));
    expect(ttsCacheKey("v1", "Nice hand.")).not.toBe(ttsCacheKey("v2", "Nice hand."));
  });

  it("evicts the oldest entry past the cap and refreshes a re-set key", () => {
    const c = new TtsCache(3);
    c.set("a", bytes(1));
    c.set("b", bytes(2));
    c.set("c", bytes(3));
    c.set("a", bytes(1)); // now newest
    c.set("d", bytes(4)); // evicts b
    expect(c.size).toBe(3);
    expect(c.get("b")).toBeUndefined();
    expect(c.get("a")?.[0]).toBe(1);
    expect(c.get("d")?.[0]).toBe(4);
  });

  it("shares one producer call across concurrent requests, then serves hits", async () => {
    const c = new TtsCache();
    let calls = 0;
    let release: (b: Uint8Array<ArrayBuffer>) => void = () => {};
    const produce = () => {
      calls += 1;
      return new Promise<Uint8Array<ArrayBuffer>>((resolve) => {
        release = resolve;
      });
    };
    const p1 = c.getOrProduce("k", produce);
    const p2 = c.getOrProduce("k", produce);
    release(bytes(7));
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(calls).toBe(1);
    expect(r1.hit).toBe(false);
    expect(r2.hit).toBe(false);
    expect(r1.bytes[0]).toBe(7);
    const r3 = await c.getOrProduce("k", produce);
    expect(calls).toBe(1);
    expect(r3.hit).toBe(true);
  });

  it("does not poison the cache when the producer fails", async () => {
    const c = new TtsCache();
    await expect(c.getOrProduce("k", () => Promise.reject(new Error("429")))).rejects.toThrow("429");
    let calls = 0;
    const r = await c.getOrProduce("k", async () => {
      calls += 1;
      return bytes(1);
    });
    expect(calls).toBe(1);
    expect(r.hit).toBe(false);
    expect(c.get("k")).toBeDefined();
  });
});
