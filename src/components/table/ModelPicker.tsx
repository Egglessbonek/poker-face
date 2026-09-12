"use client";

/**
 * Pick AI opponents: nine curated seats up front, then OpenRouter's whole catalog behind a search box.
 * Used by the table config form and the lobby's "seat another model" control.
 */

import { useEffect, useMemo, useState } from "react";
import { AI_MODELS, describeModelId, type CatalogModel } from "@/lib/llm/models";

interface Props {
  onAdd: (id: string) => void;
  disabled?: boolean;
  /** Compact = chips only plus the search box (lobby). */
  compact?: boolean;
}

const PAGE = 40;

export default function ModelPicker({ onAdd, disabled, compact }: Props) {
  const [all, setAll] = useState<CatalogModel[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(!compact);
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

  const results = useMemo(() => {
    if (!all) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((m) => `${m.vendor} ${m.name} ${m.id}`.toLowerCase().includes(needle));
  }, [all, q]);

  const custom = q.trim();
  const customLooksLikeId = /^[a-z0-9][a-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(custom) && !results.some((m) => m.id === custom);

  return (
    <div className="flex flex-col gap-3">
      {compact ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">Seat another model:</span>
          {AI_MODELS.map((m) => (
            <button key={m.id} type="button" disabled={disabled} onClick={() => onAdd(m.id)} title={`${m.vendor} · ${m.openrouter}`} className="rounded-full border border-felt-edge px-3 py-1 text-sm hover:border-gold disabled:opacity-40">
              + {m.label}
            </button>
          ))}
          <button type="button" onClick={() => setOpen((o) => !o)} className="rounded-full border border-dashed border-felt-edge px-3 py-1 text-sm text-muted hover:border-gold">
            {open ? "hide catalog" : `… ${all ? all.length : "more"} models`}
          </button>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-3">
          {AI_MODELS.map((m) => (
            <button type="button" key={m.id} disabled={disabled} onClick={() => onAdd(m.id)} className="flex flex-col gap-0.5 rounded-xl border border-felt-edge p-3 text-left transition hover:border-gold disabled:cursor-not-allowed disabled:opacity-40">
              <span className="flex items-baseline justify-between gap-2"><span className="font-semibold">+ {m.label}</span><span className="text-[10px] uppercase tracking-wider text-muted">{m.vendor}</span></span>
              <span className="text-xs text-muted">{m.tagline}</span>
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="flex flex-col gap-2 rounded-xl border border-felt-edge/70 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Every model on OpenRouter{all ? <span className="text-muted"> · {all.length}</span> : null}</p>
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setLimit(PAGE);
              }}
              placeholder="Search by name, vendor, or id…"
              aria-label="Search models"
              className="w-full max-w-xs rounded-lg border border-felt-edge bg-background px-3 py-1.5 text-sm"
            />
          </div>
          {failed && <p className="text-xs text-danger">Could not load the catalog. You can still type an OpenRouter id (vendor/model) and seat it.</p>}
          {!all && !failed && <p className="text-xs text-muted">Loading the catalog…</p>}
          {customLooksLikeId && (
            <button type="button" disabled={disabled} onClick={() => onAdd(custom)} className="flex items-center justify-between rounded-lg border border-dashed border-gold px-3 py-2 text-left text-sm hover:bg-gold/10 disabled:opacity-40">
              <span>+ Seat <span className="font-mono">{custom}</span> <span className="text-muted">({describeModelId(custom).vendor})</span></span>
              <span className="text-xs text-muted">custom id</span>
            </button>
          )}
          {all && (
            <ul className="max-h-72 divide-y divide-felt-edge/40 overflow-auto text-sm">
              {results.slice(0, limit).map((m) => (
                <li key={m.id}>
                  <button type="button" disabled={disabled} onClick={() => onAdd(m.id)} className="flex w-full items-center gap-3 px-2 py-1.5 text-left hover:bg-gold/10 disabled:opacity-40">
                    <span className="w-24 shrink-0 truncate text-xs uppercase tracking-wider text-muted">{m.vendor}</span>
                    <span className="flex-1 truncate">{m.name}<span className="ml-2 font-mono text-[11px] text-muted">{m.id}</span></span>
                    <span className="shrink-0 font-mono text-[11px] text-muted">{price(m)}</span>
                  </button>
                </li>
              ))}
              {results.length === 0 && <li className="px-2 py-2 text-muted">No models match.</li>}
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

function price(m: CatalogModel): string {
  if (m.promptPerM === 0 && m.completionPerM === 0) return "free";
  return `$${m.promptPerM}/${m.completionPerM} per M`;
}
