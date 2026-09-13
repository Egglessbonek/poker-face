"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, ChevronDown, LoaderCircle, Plus, Search } from "lucide-react";
import { FEATURED_MODEL_IDS, OPENROUTER_ID, describeModelId, formatPrice, modelSpeed, type CatalogModel } from "@/lib/llm/models";

interface Props {
  onAdd: (id: string) => void;
  disabled?: boolean;
}

/** Quick picks first, with a searchable catalog when the host wants a specific model. */
export default function ModelPicker({ onAdd, disabled }: Props) {
  const [all, setAll] = useState<CatalogModel[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (open) window.setTimeout(() => searchRef.current?.focus(), 0);
  }, [open]);

  const byId = useMemo(() => new Map((all ?? []).map((model) => [model.id, model])), [all]);
  const regulars = FEATURED_MODEL_IDS.map((id) => byId.get(id) ?? fallback(id));
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const catalog = (all ?? []).filter((model) => !FEATURED_MODEL_IDS.includes(model.id));
    if (!needle) return catalog.slice(0, 10);
    return catalog.filter((model) => `${model.name} ${model.vendor} ${model.id}`.toLowerCase().includes(needle)).slice(0, 20);
  }, [all, query]);
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
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {regulars.map((model) => (
            <button type="button" key={model.id} disabled={disabled} onClick={() => add(model.id)} title={model.id} className="group flex items-center gap-3 rounded-2xl border border-felt-edge bg-background/35 p-3 text-left transition hover:border-gold disabled:cursor-not-allowed disabled:opacity-40">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chip-blue/50 text-foreground"><Bot size={16} /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{model.name}</span><span className="block truncate text-[10px] text-muted">{model.vendor}</span><span className="mt-1 flex flex-wrap gap-1"><ModelBadge>{modelSpeed(model.id)}</ModelBadge><ModelBadge>{all ? formatPrice(model) : "Pricing…"}</ModelBadge></span></span>
              <Plus size={15} className="shrink-0 text-muted transition group-hover:text-gold" />
            </button>
          ))}
        </div>
      </div>

      <button type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)} className="flex w-full items-center justify-between rounded-xl border border-felt-edge px-4 py-3 text-sm transition hover:border-gold">
        <span className="flex items-center gap-2"><Search size={15} className="text-gold" /> Browse the full model catalog</span>
        <ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="rounded-2xl border border-felt-edge bg-background/45 p-3 sm:p-4">
          <label className="relative block">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by model, vendor, or OpenRouter id" aria-label="Search models" className="w-full rounded-xl border border-felt-edge bg-background py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-gold" />
          </label>

          {!all && !failed && <p className="flex items-center justify-center gap-2 py-7 text-xs text-muted"><LoaderCircle size={14} className="animate-spin" /> Loading the catalog…</p>}
          {failed && <p className="py-4 text-xs text-muted">The live catalog is unavailable. You can still enter a valid OpenRouter model id below.</p>}
          {all && matches.length > 0 && (
            <ul className="mt-3 grid max-h-80 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {matches.map((model) => (
                <li key={model.id}>
                  <button type="button" disabled={disabled} onClick={() => add(model.id)} title={model.id} className="group flex h-full w-full items-center gap-3 rounded-xl border border-felt-edge p-3 text-left transition hover:border-gold disabled:opacity-40">
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{model.name}</span><span className="block truncate text-[10px] text-muted">{model.vendor}</span><span className="mt-1 flex flex-wrap gap-1"><ModelBadge>{modelSpeed(model.id)}</ModelBadge><ModelBadge>{formatPrice(model)}</ModelBadge></span></span>
                    <Plus size={14} className="shrink-0 text-muted group-hover:text-gold" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {all && query && matches.length === 0 && !canAddTyped && <p className="py-6 text-center text-xs text-muted">No models match “{query}”.</p>}
          {canAddTyped && (
            <button type="button" disabled={disabled} onClick={() => add(typedId)} className="mt-3 flex w-full items-center justify-between rounded-xl border border-dashed border-gold/60 px-3 py-2.5 text-left text-sm disabled:opacity-40">
              <span className="min-w-0"><span className="block">Use exact OpenRouter id</span><span className="block truncate font-mono text-[10px] text-muted">{typedId}</span></span><Plus size={15} className="text-gold" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function fallback(id: string): CatalogModel {
  const { label, vendor } = describeModelId(id);
  return { id, name: label, vendor, contextLength: 0, promptPerM: 0, completionPerM: 0 };
}

function ModelBadge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-felt-edge bg-background/60 px-1.5 py-0.5 text-[9px] leading-none text-muted">{children}</span>;
}
