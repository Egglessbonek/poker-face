"use client";

/**
 * The guest list. Every AI at the table is a real model playing as itself; this is where the host
 * decides who gets a chair. Six regulars up front, everyone else OpenRouter knows in a dropdown.
 */

import { useEffect, useMemo, useState } from "react";
import { FEATURED_MODEL_IDS, OPENROUTER_ID, describeModelId, formatPrice, type CatalogModel } from "@/lib/llm/models";

interface Props {
  onAdd: (id: string) => void;
  disabled?: boolean;
  /** Lobby mode: chips instead of cards. */
  compact?: boolean;
}

export default function ModelPicker({ onAdd, disabled, compact }: Props) {
  const [all, setAll] = useState<CatalogModel[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [choice, setChoice] = useState("");
  const [typed, setTyped] = useState("");

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

  /** Catalog grouped by vendor for <optgroup>, regulars excluded. */
  const groups = useMemo(() => {
    const g = new Map<string, CatalogModel[]>();
    for (const m of all ?? []) {
      if (FEATURED_MODEL_IDS.includes(m.id)) continue;
      g.set(m.vendor, [...(g.get(m.vendor) ?? []), m]);
    }
    return [...g.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [all]);

  const invite = () => {
    if (!choice) return;
    onAdd(choice);
    setChoice("");
  };
  const typedOk = OPENROUTER_ID.test(typed.trim());

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
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs uppercase tracking-[0.2em] text-gold">Anyone else?</p>
        {failed ? (
          <div className="flex flex-wrap gap-2">
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="vendor/model id from openrouter.ai/models" aria-label="OpenRouter model id" className="min-w-0 flex-1 rounded-lg border border-felt-edge bg-background px-3 py-2 font-mono text-sm" />
            <button type="button" disabled={disabled || !typedOk} onClick={() => { onAdd(typed.trim()); setTyped(""); }} className="rounded-lg bg-gold px-4 py-2 text-sm font-medium text-background disabled:opacity-40">Set a place</button>
            <p className="w-full text-xs text-muted">Couldn&apos;t reach the guest book, so type an id and we&apos;ll still set a place.</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <select value={choice} onChange={(e) => setChoice(e.target.value)} disabled={disabled || !all} aria-label="More models" className="min-w-0 flex-1 rounded-lg border border-felt-edge bg-background px-3 py-2 text-sm disabled:opacity-60">
              <option value="">{all ? `Everyone else we know · ${groups.reduce((n, [, ms]) => n + ms.length, 0)}` : "Flipping through the guest book…"}</option>
              {groups.map(([vendor, ms]) => (
                <optgroup key={vendor} label={vendor}>
                  {ms.map((m) => (
                    <option key={m.id} value={m.id}>{m.name} · {formatPrice(m)}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button type="button" disabled={disabled || !choice} onClick={invite} className="rounded-lg bg-gold px-4 py-2 text-sm font-medium text-background disabled:opacity-40">Invite</button>
          </div>
        )}
      </div>
    </div>
  );
}

function fallback(id: string): CatalogModel {
  const { label, vendor } = describeModelId(id);
  return { id, name: label, vendor, contextLength: 0, promptPerM: 0, completionPerM: 0 };
}
