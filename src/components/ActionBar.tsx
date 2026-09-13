"use client";

/** The seated player's action buttons and bet sizing. */
import { useState } from "react";
import type { ActionBounds, ActionType } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  legal: ActionType[];
  bounds: ActionBounds | null;
  pot: number;
  disabled?: boolean;
  onAct: (type: ActionType, amount?: number) => void;
}

export default function ActionBar({ legal, bounds, pot, disabled, onAct }: Props) {
  // Size is derived from bounds unless the player has overridden it for this exact decision.
  const key = bounds ? `${bounds.minTotal}-${bounds.maxTotal}-${pot}` : "";
  const [override, setOverride] = useState<{ key: string; value: number } | null>(null);
  const clamp = (v: number) => (bounds ? Math.min(bounds.maxTotal, Math.max(bounds.minTotal, Math.round(v))) : v);
  const size = override?.key === key ? override.value : bounds ? clamp(bounds.minTotal + pot * 0.5) : 0;
  const setSize = (v: number) => setOverride({ key, value: clamp(v) });

  const has = (a: ActionType) => legal.includes(a);
  const off = disabled || legal.length === 0;
  const base = "h-12 min-w-0 truncate whitespace-nowrap rounded-xl px-2 text-sm font-medium tabular-nums transition disabled:cursor-not-allowed disabled:opacity-30";
  const sizing = has("bet") || has("raise");
  const raiseWord = has("raise") ? "Raise" : "Bet";

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-felt-edge p-3">
        <div className="grid h-8 grid-cols-[minmax(0,1fr)_64px_auto_auto] items-center gap-2" aria-label="Bet sizing">
          <input aria-label="Bet size" type="range" min={bounds?.minTotal ?? 0} max={bounds?.maxTotal ?? 1} value={size} onChange={(e) => setSize(Number(e.target.value))} className="min-w-0 w-full accent-gold" disabled={off || !sizing} />
          <input aria-label="Bet amount" type="number" min={bounds?.minTotal} max={bounds?.maxTotal} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-16 rounded-lg border border-felt-edge bg-background px-2 py-1 font-mono text-sm disabled:opacity-30" disabled={off || !sizing} />
          {[["½ pot", 0.5], ["pot", 1]].map(([label, f]) => (
            <button key={label as string} type="button" disabled={off || !sizing || !bounds} onClick={() => bounds && setSize(bounds.minTotal + (pot + bounds.toCall) * (f as number))} className="rounded-lg border border-felt-edge px-2 py-1 text-xs disabled:opacity-30">
              {label}
            </button>
          ))}
        </div>
      <div className="grid grid-cols-4 gap-2">
        <button className={cn(base, "bg-danger/80")} disabled={off || !has("fold")} data-action="fold" onClick={() => onAct("fold")}>Fold</button>
        {has("check") ? (
          <button className={cn(base, "border border-felt-edge")} disabled={off} data-action="check" onClick={() => onAct("check")}>Check</button>
        ) : (
          <button className={cn(base, "border border-felt-edge")} disabled={off || !has("call")} data-action="call" onClick={() => onAct("call")}>
            Call {bounds?.toCall ?? ""}
          </button>
        )}
        <button className={cn(base, "bg-gold text-background")} aria-label={sizing ? `${has("raise") ? "Raise to" : "Bet"} ${size}` : "Bet"} disabled={off || !sizing} data-action="bet" onClick={() => onAct(has("raise") ? "raise" : "bet", size)}>
          {raiseWord} {sizing ? size : ""}
        </button>
        <button className={cn(base, "bg-chip-red")} disabled={off || !has("allin")} data-action="allin" onClick={() => onAct("allin")}>All in</button>
      </div>
    </div>
  );
}
