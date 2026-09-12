"use client";

export default function BluffMeter({ value, compact }: { value: number; compact?: boolean }) {
  const pct = Math.round(value * 100);
  if (compact) {
    return (
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-background" title={`bluff likelihood ${pct}%`}>
        <div className="h-full bg-gradient-to-r from-ok via-gold to-danger" style={{ width: `${pct}%` }} />
      </div>
    );
  }
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-muted"><span>Honest</span><span>Bluff</span></div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-background">
        <div className="h-full bg-gradient-to-r from-ok via-gold to-danger" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-right font-mono text-xs">{pct}%</p>
    </div>
  );
}
