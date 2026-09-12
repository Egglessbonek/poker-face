"use client";

/**
 * The guest list. Every AI at the table is a real model playing as itself; this is where the host
 * decides who gets a chair. The regulars are pinned; everyone else OpenRouter knows is behind a search.
 */

import { useEffect, useMemo, useState } from "react";
import { FEATURED_MODEL_IDS, OPENROUTER_ID, describeModelId, formatPrice, type CatalogModel } from "@/lib/llm/models";

interface Props {
  onAdd: (id: string) => void;
  disabled?: boolean;
  /** Lobby mode: one row of regulars plus a "more" toggle. */
  compact?: boolean;
}

const PAGE = 40;

export default function ModelPicker({ onAdd, disabled, compact }: Props) {
  const [all, setAll] = useState<CatalogModel[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/models")
      .then((r) => r.json())
      .then((d: { all: CatalogModel[] }) => {
        if (!cancelled) setAll(d.all);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const byId = useMemo(() => new Map((all ?? []).map((m) => [m.id, m])), [all]);
  const regulars = FEATURED_MODEL_IDS.map((id) => byId.get(id) ?? fallback(id));

  const results = useMemo(() => {
    if (!all) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((m) => `${m.vendor} ${m.name} ${m.id}`.toLowerCase().includes(needle));
  }, [all, q]);

  const custom = q.trim();
  const customLooksLikeId = OPENROUTER_ID.test(custom) && !byId.has(custom);
  const count = all?.length;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="mb-2 text-xs uppercase tracking-[0.2em] text-gold">The regulars</p>
        <div className={compact ? "flex flex-wrap gap-2" : "grid gap-2 sm:grid-cols-3"}>
          {regulars.map((m) => (
            <button
              type="button"
              key={m.id}
              disabled={disabled}
              onClick={() => onAdd(m.id)}
              title={m.id}
              className={
                compact
                  ? "rounded-full border border-felt-edge px-3 py-1 text-sm hover:border-gold disabled:opacity-40"
                  : "flex items-baseline justify-between gap-2 rounded-xl border border-felt-edge px-3 py-2.5 text-left transition hover:border-gold disabled:cursor-not-allowed disabled:opacity-40"
              }
            >
              <span className="font-medium">{compact ? "+ " : ""}{m.name}</span>
              {!compact && <span className="text-[10px] uppercase tracking-wider text-muted">{m.vendor}</span>}
            </button>
          ))}
          <button type="button" onClick={() => setOpen((o) => !o)} className={compact ? "rounded-full border border-dashed border-felt-edge px-3 py-1 text-sm text-muted hover:border-gold" : "flex items-center justify-center rounded-xl border border-dashed border-felt-edge px-3 py-2.5 text-sm text-muted transition hover:border-gold"}>
            {open ? "That's enough guests" : count ? `Everyone else we know · ${count}` : "Everyone else we know"}
          </button>
        </div>
      </div>

      {open && (
        <div className="flex flex-col gap-2 rounded-xl border border-felt-edge/70 p-3">
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setLimit(PAGE);
            }}
            placeholder="Looking for someone in particular?"
            aria-label="Search models"
            autoFocus
            className="w-full rounded-lg border border-felt-edge bg-background px-3 py-2 text-sm"
          />
          {failed && <p className="text-xs text-danger">Couldn&apos;t reach the guest book. Type an OpenRouter id (vendor/model) and we&apos;ll still set a place.</p>}
          {!all && !failed && <p className="text-xs text-muted">Flipping through the guest book…</p>}
          {customLooksLikeId && (
            <button type="button" disabled={disabled} onClick={() => onAdd(custom)} className="flex items-center justify-between rounded-lg border border-dashed border-gold px-3 py-2 text-left text-sm hover:bg-gold/10 disabled:opacity-40">
              <span>Set a place for <span className="font-mono">{custom}</span></span>
              <span className="text-xs text-muted">{describeModelId(custom).vendor}</span>
            </button>
          )}
          {all && (
            <ul className="max-h-72 divide-y divide-felt-edge/40 overflow-auto text-sm">
              {results.slice(0, limit).map((m) => (
                <li key={m.id}>
                  <button type="button" disabled={disabled} onClick={() => onAdd(m.id)} className="flex w-full items-center gap-3 px-2 py-1.5 text-left hover:bg-gold/10 disabled:opacity-40">
                    <span className="w-24 shrink-0 truncate text-[11px] uppercase tracking-wider text-muted">{m.vendor}</span>
                    <span className="flex-1 truncate">{m.name}<span className="ml-2 font-mono text-[11px] text-muted">{m.id}</span></span>
                    <span className="shrink-0 font-mono text-[11px] text-muted">{formatPrice(m)}</span>
                  </button>
                </li>
              ))}
              {results.length === 0 && !customLooksLikeId && <li className="px-2 py-2 text-muted">Nobody by that name.</li>}
              {results.length > limit && (
                <li>
                  <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="w-full px-2 py-2 text-center text-xs text-muted underline">show {Math.min(PAGE, results.length - limit)} more of {results.length}</button>
                </li>
              )}
            </ul>
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
