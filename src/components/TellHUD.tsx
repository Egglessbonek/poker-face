"use client";

import type { TellFrame, TellVector } from "@/lib/types";

/** Live debug/insight panel. TODO(phase 2): gauges for blink, gaze, stillness, tension, emotion wheel. */
export default function TellHUD({ frame, vector }: { frame?: TellFrame; vector?: TellVector }) {
  return (
    <aside className="rounded-2xl border border-felt-edge p-4 font-mono text-xs">
      <p className="mb-2 text-sm font-semibold text-gold">Tells</p>
      {frame ? <pre className="whitespace-pre-wrap">{JSON.stringify(frame, null, 1)}</pre> : <p className="text-muted">Camera not started</p>}
      {vector && <pre className="mt-2 whitespace-pre-wrap">{JSON.stringify(vector, null, 1)}</pre>}
    </aside>
  );
}
