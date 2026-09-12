"use client";

/**
 * Post-match analysis.
 * TODO(phase 4): poker-face score, Recharts timeline (arousal + bluffLikelihood per hand, colored by actual bluff),
 * biggest leaks, hands where tells changed the villain's action (mathAction !== action), raw "what the villain saw" log.
 */
import type { Session } from "@/lib/types";

export default function RevealView({ session }: { session: Session }) {
  const decisions = session.log.filter((e) => e.kind === "villain_decision");
  return (
    <main className="flex flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <header>
        <p className="text-xs uppercase tracking-[0.3em] text-gold">The Reveal</p>
        <h1 className="text-3xl font-semibold">What your face gave away</h1>
        <p className="text-sm text-muted">Session {session.id} · {decisions.length} villain decisions logged</p>
      </header>
      <section>
        <h2 className="mb-2 text-lg font-medium">What the villain saw</h2>
        <pre className="max-h-[60vh] overflow-auto rounded-xl border border-felt-edge p-3 font-mono text-[11px]">
          {JSON.stringify(session.log, null, 1)}
        </pre>
      </section>
    </main>
  );
}
