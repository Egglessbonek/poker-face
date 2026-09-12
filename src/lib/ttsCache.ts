/**
 * Server-side cache of synthesized table talk: (voiceId, text) -> audio bytes.
 *
 * Every client at a table asks for the same line at the same moment, so one ElevenLabs call must serve all of
 * them: identical requests in flight share a single producer, and finished audio is kept for replays (a refresh,
 * a spectator joining late). Bounded, oldest-first eviction. Single Node process; lives on globalThis so dev
 * hot-reloads keep it.
 */

export const MAX_ENTRIES = 200;

export function ttsCacheKey(voiceId: string, text: string): string {
  return `${voiceId}\n${text.trim().replace(/\s+/g, " ")}`;
}

export class TtsCache {
  private readonly entries = new Map<string, Uint8Array<ArrayBuffer>>();
  private readonly inFlight = new Map<string, Promise<Uint8Array<ArrayBuffer>>>();

  constructor(private readonly max = MAX_ENTRIES) {}

  get size(): number {
    return this.entries.size;
  }

  get(key: string): Uint8Array<ArrayBuffer> | undefined {
    return this.entries.get(key);
  }

  set(key: string, bytes: Uint8Array<ArrayBuffer>): void {
    // Re-inserting moves the key to the newest position, so a replayed line is not the next to go.
    this.entries.delete(key);
    this.entries.set(key, bytes);
    while (this.entries.size > this.max) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  /** Cached bytes, or one shared call to `produce` for every concurrent request of the same key. */
  async getOrProduce(key: string, produce: () => Promise<Uint8Array<ArrayBuffer>>): Promise<{ bytes: Uint8Array<ArrayBuffer>; hit: boolean }> {
    const cached = this.entries.get(key);
    if (cached) return { bytes: cached, hit: true };
    let pending = this.inFlight.get(key);
    if (!pending) {
      pending = produce().then((bytes) => {
        this.set(key, bytes);
        return bytes;
      });
      this.inFlight.set(key, pending);
      void pending.finally(() => this.inFlight.delete(key)).catch(() => {});
    }
    return { bytes: await pending, hit: false };
  }
}

const g = globalThis as unknown as { __ttsCache?: TtsCache };

/** The process-wide cache. */
export function ttsCache(): TtsCache {
  return (g.__ttsCache ??= new TtsCache());
}
