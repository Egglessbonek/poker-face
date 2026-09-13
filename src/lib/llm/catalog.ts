/**
 * OpenRouter's live model list, cached in memory for an hour. Server only.
 * The endpoint is public (no key needed), so the picker works before any key is configured.
 */

import "server-only";
import { toCatalogModel, type CatalogModel } from "./models";

const TTL_MS = 60 * 60 * 1000;
const g = globalThis as unknown as { __orCatalog?: { at: number; models: CatalogModel[] }; __orCatalogPending?: Promise<CatalogModel[]> };

export async function getCatalog(): Promise<CatalogModel[]> {
  const cached = g.__orCatalog;
  if (cached && Date.now() - cached.at < TTL_MS) return cached.models;
  if (g.__orCatalogPending) return g.__orCatalogPending;
  g.__orCatalogPending = fetchCatalog()
    .then((models) => {
      if (models.length) g.__orCatalog = { at: Date.now(), models };
      return models.length ? models : (cached?.models ?? []);
    })
    .catch((err) => {
      // The live catalog is an optional enhancement: callers deliberately fall back to
      // pinned model IDs when OpenRouter is unreachable. Logging this as an error makes
      // Next's dev overlay report a broken app even though that fallback succeeded.
      console.warn("OpenRouter catalog unavailable; using pinned model IDs", (err as Error).message);
      return cached?.models ?? [];
    })
    .finally(() => {
      g.__orCatalogPending = undefined;
    });
  return g.__orCatalogPending;
}

/** Synchronous lookup against whatever is cached (may be empty before the first fetch). */
export function cachedCatalogModel(id: string): CatalogModel | undefined {
  return g.__orCatalog?.models.find((m) => m.id === id);
}

/** Kick off a fetch without waiting (used when a table is created so seats resolve names quickly). */
export function warmCatalog(): void {
  void getCatalog();
}

async function fetchCatalog(): Promise<CatalogModel[]> {
  const res = await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(10_000), headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { data?: Array<Parameters<typeof toCatalogModel>[0]> };
  const models = (data.data ?? []).map(toCatalogModel).filter((m): m is CatalogModel => !!m);
  models.sort((a, b) => a.vendor.localeCompare(b.vendor) || a.name.localeCompare(b.name));
  return models;
}
