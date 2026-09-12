"use client";

/**
 * Hero's action buttons. This element is where cursor tells are captured.
 * TODO(phase 3): wire createCursorTracker() to onPointerMove / onPointerEnter per button.
 */
export default function ActionBar({ disabled }: { disabled?: boolean }) {
  const base = "rounded-xl px-6 py-3 font-medium disabled:opacity-40";
  return (
    <div className="flex flex-wrap justify-center gap-3">
      <button className={`${base} bg-danger/80`} disabled={disabled} data-action="fold">Fold</button>
      <button className={`${base} border border-felt-edge`} disabled={disabled} data-action="check">Check</button>
      <button className={`${base} border border-felt-edge`} disabled={disabled} data-action="call">Call</button>
      <button className={`${base} bg-gold text-background`} disabled={disabled} data-action="bet">Bet</button>
      <button className={`${base} bg-chip-red`} disabled={disabled} data-action="allin">All in</button>
    </div>
  );
}
