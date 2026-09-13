"use client";

import { useEffect, useState } from "react";
import type { HallEntry } from "@/lib/types";

/** Landing-page leaderboard of human poker faces (the "hall" in the code). Fetches /api/hall once on mount. */
export default function HallOfPokerFaces() {
  const [entries, setEntries] = useState<HallEntry[] | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/hall", { signal: ctrl.signal, cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data: { entries?: HallEntry[] }) => setEntries(Array.isArray(data.entries) ? data.entries : []))
      .catch(() => {
        if (!ctrl.signal.aborted) setEntries([]);
      });
    return () => ctrl.abort();
  }, []);

  return (
    <section aria-labelledby="hall-title" className="rounded-2xl border border-white/10 bg-background/70 p-6 shadow-lg shadow-black/30 backdrop-blur-md sm:p-8">
      <h2 id="hall-title" className="text-3xl leading-tight">
        Leaderboard
      </h2>
      <p className="mt-1 text-sm text-muted">These guys are lowkey goated.</p>

      {entries === null ? (
        <p className="mt-6 text-sm text-muted">Reading the room&hellip;</p>
      ) : entries.length === 0 ? (
        <p className="mt-6 text-sm text-muted">No people yet.</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.22em] text-muted">
                <th scope="col" className="pb-2 pr-3 font-normal">
                  #
                </th>
                <th scope="col" className="pb-2 pr-3 font-normal">
                  Player
                </th>
                <th scope="col" className="pb-2 pr-3 text-right font-normal">
                  Poker face
                </th>
                <th scope="col" className="pb-2 pr-3 text-right font-normal">
                  Bluffs caught
                </th>
                <th scope="col" className="pb-2 text-right font-normal">
                  Reads right
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={`${e.code}-${e.at}-${i}`} className="border-t border-white/10">
                  <td className="py-2 pr-3 align-top font-mono text-muted">{i + 1}</td>
                  <td className="py-2 pr-3 align-top">
                    <span className="block">{e.name}</span>
                    {e.bestLine && <span className="line-clamp-1 block text-xs italic text-muted">&ldquo;{e.bestLine}&rdquo;</span>}
                  </td>
                  <td className="py-2 pr-3 text-right align-top font-display text-2xl leading-none text-gold">{e.pokerFace}</td>
                  <td className="py-2 pr-3 text-right align-top font-mono">
                    {e.bluffsCaught}/{e.bluffs}
                  </td>
                  <td className="py-2 text-right align-top font-mono">
                    {e.readsRight}/{e.readsTotal}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
