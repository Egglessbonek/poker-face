"use client";

import { Activity, Bot, History, ScanFace } from "lucide-react";
import { useState } from "react";
import RailHistory from "./RailHistory";
import { AiReadCard, HumanTellCard } from "./RailInsights";
import type { RailHistoryEntry, RailPlayerView } from "./model";

type InspectorTab = "tells" | "reads" | "history";

const TABS: Array<{ id: InspectorTab; label: string; icon: typeof Activity }> = [
  { id: "tells", label: "Tells", icon: ScanFace },
  { id: "reads", label: "AI reads", icon: Bot },
  { id: "history", label: "History", icon: History },
];

export default function RailInspector({ humans, ais, history, currentPlayerId = null }: { humans: RailPlayerView[]; ais: RailPlayerView[]; history: RailHistoryEntry[]; currentPlayerId?: string | null }) {
  const [tab, setTab] = useState<InspectorTab>("tells");
  // Spotlight the AI on the clock if it has a read this hand, otherwise whichever AI read most recently.
  const withReads = ais.filter((player) => player.aiRead);
  const spotlight = withReads.find((player) => player.id === currentPlayerId) ?? [...withReads].sort((a, b) => (b.aiRead?.at ?? 0) - (a.aiRead?.at ?? 0))[0];
  const onCamera = humans.filter((player) => player.tell).length;
  const read = spotlight?.aiRead;

  return (
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0e1613]/95 shadow-xl" aria-label="Table intelligence">
      <div className="grid grid-cols-3 gap-1 border-b border-white/8 p-1.5" role="tablist" aria-label="Rail information">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            id={`rail-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls={`rail-panel-${id}`}
            onClick={() => setTab(id)}
            className={`flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors ${tab === id ? "bg-white/8 text-white" : "text-white/45 hover:bg-white/5 hover:text-white/75"}`}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {read && spotlight && (
        <section className="shrink-0 border-b border-white/8 bg-[linear-gradient(135deg,rgba(212,175,55,0.09),transparent)] px-3.5 py-3" aria-label="Current AI decision">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gold">Current decision</p>
            {read.equity !== undefined && <span className="font-mono text-[11px] text-gold">{read.equity}% equity</span>}
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-3">
            <p className="truncate text-sm font-semibold text-white">{spotlight.name} reading {read.target}</p>
            <span className="shrink-0 rounded-md bg-gold px-2 py-1 text-[10px] font-bold text-black">{read.mathAction} → {read.finalAction}</span>
          </div>
          <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-white/50">{read.reasoning}</p>
        </section>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        <section id="rail-panel-tells" role="tabpanel" aria-labelledby="rail-tab-tells" hidden={tab !== "tells"} className="h-full overflow-y-auto p-2.5">
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-xs font-semibold text-white">Human signals</h2>
            <span className="text-[10px] uppercase tracking-wider text-white/30">{onCamera} of {humans.length} on camera</span>
          </div>
          {onCamera === 0 ? (
            <p className="px-1 py-6 text-center text-xs leading-relaxed text-white/40">No camera feed yet. Signals appear the moment a player turns theirs on; reads follow their first bet.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-2">
              {humans.map((player) => <HumanTellCard key={player.id} player={player} compact />)}
            </div>
          )}
        </section>

        <section id="rail-panel-reads" role="tabpanel" aria-labelledby="rail-tab-reads" hidden={tab !== "reads"} className="h-full overflow-y-auto p-2.5">
          <div className="space-y-2">{ais.map((player) => <AiReadCard key={player.id} player={player} compact />)}</div>
        </section>

        <section id="rail-panel-history" role="tabpanel" aria-labelledby="rail-tab-history" hidden={tab !== "history"} className="h-full p-2.5">
          <RailHistory entries={history} embedded />
        </section>
      </div>
    </aside>
  );
}
