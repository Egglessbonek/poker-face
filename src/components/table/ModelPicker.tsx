"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, LoaderCircle, Plus, Search } from "lucide-react";
import { FEATURED_MODEL_IDS, OPENROUTER_ID, describeModelId, formatPrice, groupCatalogByProvider, modelSpeed, type CatalogModel } from "@/lib/llm/models";

interface Props {
  onAdd: (id: string) => void;
  disabled?: boolean;
}

/** Quick picks first, with a searchable catalog when the host wants a specific model. */
export default function ModelPicker({ onAdd, disabled }: Props) {
  const [all, setAll] = useState<CatalogModel[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/models")
      .then((response) => {
        if (!response.ok) throw new Error(`Model catalog returned ${response.status}`);
        return response.json();
      })
      .then((data: { all: CatalogModel[] }) => {
        if (!Array.isArray(data.all)) throw new Error("Model catalog response was invalid");
        if (!cancelled) setAll(data.all);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const byId = useMemo(() => new Map((all ?? []).map((model) => [model.id, model])), [all]);
  const regulars = FEATURED_MODEL_IDS.map((id) => byId.get(id) ?? fallback(id));
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return all ?? [];
    return (all ?? []).filter((model) => `${model.name} ${model.vendor} ${model.id}`.toLowerCase().includes(needle));
  }, [all, query]);
  const providerGroups = useMemo(() => groupCatalogByProvider(matches), [matches]);
  const typedId = query.trim();
  const canAddTyped = OPENROUTER_ID.test(typedId) && !(all ?? []).some((model) => model.id === typedId);

  const add = (id: string) => {
    if (disabled) return;
    onAdd(id);
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-xs uppercase tracking-[0.2em] text-gold">Popular opponents</p>
        <div className="grid gap-1.5 sm:grid-cols-3">
          {regulars.map((model) => (
            <button type="button" key={model.id} disabled={disabled} onClick={() => add(model.id)} title={model.id} className="group flex min-h-14 items-center gap-2 rounded-xl border border-felt-edge bg-background/35 p-2 text-left transition hover:border-gold disabled:cursor-not-allowed disabled:opacity-40">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-chip-blue/50 text-foreground"><Bot size={13} /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{model.name}</span><span className="block truncate text-[9px] text-muted">{model.vendor}</span><span className="mt-1 flex flex-wrap gap-1"><ModelBadge>{modelSpeed(model.id)}</ModelBadge><ModelBadge>{all ? formatPrice(model) : "Pricing…"}</ModelBadge></span></span>
              <Plus size={13} className="shrink-0 text-muted transition group-hover:text-gold" />
            </button>
          ))}
        </div>
      </div>

      <section aria-labelledby="model-catalog-title" className="rounded-2xl border border-felt-edge bg-background/45 p-3 sm:p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div><h3 id="model-catalog-title" className="font-sans text-xs font-normal uppercase tracking-[0.2em] text-gold">Full model catalog</h3><p className="mt-1 text-[10px] text-muted">All available models, grouped alphabetically by provider.</p></div>
          {all && <p className="font-mono text-[10px] text-muted">{matches.length} models · {providerGroups.length} providers</p>}
        </div>
        <label className="relative mt-3 block">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by model, provider, or OpenRouter id" aria-label="Search models" className="w-full rounded-lg border border-felt-edge bg-background py-2 pl-8 pr-3 text-xs outline-none transition focus:border-gold" />
        </label>

        {!all && !failed && <p className="flex items-center justify-center gap-2 py-7 text-xs text-muted"><LoaderCircle size={14} className="animate-spin" /> Loading the catalog…</p>}
        {failed && <p className="py-4 text-xs text-muted">The live catalog is unavailable. You can still enter a valid OpenRouter model id.</p>}
        {all && providerGroups.length > 0 && (
          <div className="mt-4 space-y-4">
            {providerGroups.map((group) => (
              <section key={group.provider} aria-labelledby={`provider-${providerSlug(group.provider)}`}>
                <div className="mb-1.5 flex items-center gap-2 border-b border-felt-edge/60 pb-1.5"><h4 id={`provider-${providerSlug(group.provider)}`} className="text-sm font-medium">{group.provider}</h4><span className="rounded-full bg-felt-edge/35 px-1.5 py-0.5 font-mono text-[9px] text-muted">{group.models.length}</span></div>
                <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {group.models.map((model) => (
                    <li key={model.id}>
                      <button type="button" disabled={disabled} onClick={() => add(model.id)} title={model.id} className="group flex min-h-11 w-full items-center gap-2 rounded-lg border border-felt-edge/70 bg-background/25 p-2 text-left transition hover:border-gold disabled:opacity-40">
                        <span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-medium">{model.name}</span><span className="mt-1 flex flex-wrap gap-1"><ModelBadge>{modelSpeed(model.id)}</ModelBadge><ModelBadge>{formatPrice(model)}</ModelBadge></span></span>
                        <Plus size={12} className="shrink-0 text-muted group-hover:text-gold" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
        {all && query && matches.length === 0 && !canAddTyped && <p className="py-6 text-center text-xs text-muted">No models match “{query}”.</p>}
        {canAddTyped && (
          <button type="button" disabled={disabled} onClick={() => add(typedId)} className="mt-3 flex w-full items-center justify-between rounded-xl border border-dashed border-gold/60 px-3 py-2.5 text-left text-sm disabled:opacity-40">
            <span className="min-w-0"><span className="block">Use exact OpenRouter id</span><span className="block truncate font-mono text-[10px] text-muted">{typedId}</span></span><Plus size={15} className="text-gold" />
          </button>
        )}
      </section>
    </div>
  );
}

function fallback(id: string): CatalogModel {
  const { label, vendor } = describeModelId(id);
  return { id, name: label, vendor, contextLength: 0, promptPerM: 0, completionPerM: 0 };
}

function ModelBadge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-felt-edge bg-background/60 px-1 py-0.5 text-[8px] leading-none text-muted">{children}</span>;
}

function providerSlug(provider: string): string {
  return provider.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
