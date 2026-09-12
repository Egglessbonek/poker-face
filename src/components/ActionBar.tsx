"use client";

/**
 * Hero's action buttons and bet sizing. This element is where cursor tells are captured:
 * pointer movement over the bar and hover dwell on Fold vs Bet feed the CursorTracker.
 */
import { useState } from "react";
import type { CursorTracker } from "@/lib/tells/cursor";
import type { ActionBounds, ActionType } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  legal: ActionType[];
  bounds: ActionBounds | null;
  pot: number;
  disabled?: boolean;
  onAct: (type: ActionType, amount?: number) => void;
  cursor?: CursorTracker;
}

export default function ActionBar({ legal, bounds, pot, disabled, onAct, cursor }: Props) {
  // Size is derived from bounds unless the player has overridden it for this exact decision.
  const key = bounds ? `${bounds.minTotal}-${bounds.maxTotal}-${pot}` : "";
  const [override, setOverride] = useState<{ key: string; value: number } | null>(null);
  const clamp = (v: number) => (bounds ? Math.min(bounds.maxTotal, Math.max(bounds.minTotal, Math.round(v))) : v);
  const size = override?.key === key ? override.value : bounds ? clamp(bounds.minTotal + pot * 0.5) : 0;
  const setSize = (v: number) => setOverride({ key, value: clamp(v) });

  const has = (a: ActionType) => legal.includes(a);
  const off = disabled || legal.length === 0;
  const base = "rounded-xl px-5 py-3 font-medium transition disabled:cursor-not-allowed disabled:opacity-30";
  const sizing = has("bet") || has("raise");
  const raiseWord = has("raise") ? "Raise to" : "Bet";

  return (
    <div
      className="flex flex-col gap-3 rounded-2xl border border-felt-edge p-3"
      data-actionbar
      onPointerMove={(e) => cursor?.move(e.clientX, e.clientY)}
      onPointerLeave={() => cursor?.hover(null)}
    >
      {sizing && bounds && (
        <div className="flex flex-wrap items-center gap-3">
          <input type="range" min={bounds.minTotal} max={bounds.maxTotal} value={size} onChange={(e) => setSize(Number(e.target.value))} className="flex-1 accent-gold" disabled={off} />
          <input type="number" min={bounds.minTotal} max={bounds.maxTotal} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-20 rounded-lg border border-felt-edge bg-background px-2 py-1 font-mono text-sm" disabled={off} />
          {[["½ pot", 0.5], ["pot", 1]].map(([label, f]) => (
            <button key={label as string} type="button" disabled={off} onClick={() => setSize(bounds.minTotal + (pot + bounds.toCall) * (f as number))} className="rounded-lg border border-felt-edge px-2 py-1 text-xs">
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap justify-center gap-3">
        <button className={cn(base, "bg-danger/80")} disabled={off || !has("fold")} data-action="fold" onPointerEnter={() => cursor?.hover("fold")} onClick={() => onAct("fold")}>Fold</button>
        {has("check") ? (
          <button className={cn(base, "border border-felt-edge")} disabled={off} data-action="check" onClick={() => onAct("check")}>Check</button>
        ) : (
          <button className={cn(base, "border border-felt-edge")} disabled={off || !has("call")} data-action="call" onClick={() => onAct("call")}>
            Call {bounds?.toCall ?? ""}
          </button>
        )}
        <button className={cn(base, "bg-gold text-background")} disabled={off || !sizing} data-action="bet" onPointerEnter={() => cursor?.hover("bet")} onClick={() => onAct(has("raise") ? "raise" : "bet", size)}>
          {raiseWord} {sizing ? size : ""}
        </button>
        <button className={cn(base, "bg-chip-red")} disabled={off || !has("allin")} data-action="allin" onPointerEnter={() => cursor?.hover("bet")} onClick={() => onAct("allin")}>All in</button>
      </div>
    </div>
  );
}
