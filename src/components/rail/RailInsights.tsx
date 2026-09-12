import { Activity, Bot, BrainCircuit, Eye, Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { RailPlayerView } from "./model";

function Meter({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
      <div className={`h-full rounded-full transition-[width] duration-700 ${color}`} style={{ width: `${value}%` }} />
    </div>
  );
}

function TrendIcon({ trend }: { trend: "rising" | "falling" | "stable" }) {
  if (trend === "rising") return <TrendingUp size={13} className="text-ok" />;
  if (trend === "falling") return <TrendingDown size={13} className="text-danger" />;
  return <Minus size={13} className="text-white/45" />;
}

export function HumanTellCard({ player, compact = false }: { player: RailPlayerView; compact?: boolean }) {
  if (!player.tell) return null;
  const tell = player.tell;
  const composure = tell.arousal === undefined ? undefined : Math.max(0, Math.min(100, 100 - tell.arousal));
  const composureTrend = tell.trend === "rising" ? "falling" : tell.trend === "falling" ? "rising" : tell.trend;
  const composureColor = composure === undefined ? "bg-white/20" : composure >= 67 ? "bg-ok" : composure >= 34 ? "bg-gold" : "bg-danger";
  return (
    <article className={`rounded-xl border border-white/10 bg-white/[0.035] ${compact ? "p-2.5" : "p-3.5"}`}>
      <div className={`${compact ? "mb-2" : "mb-3"} flex flex-wrap items-center justify-between gap-x-3 gap-y-1`}>
        <div className="min-w-0">
          <p className={`${compact ? "text-sm" : ""} font-semibold text-white`}>{player.name}</p>
          <div className="mt-0.5 flex items-center gap-1 text-xs text-white/45"><Eye size={12} /> {tell.emotion}</div>
        </div>
        {tell.read && composureTrend ? (
          <div className="flex shrink-0 items-center gap-1 rounded-full bg-white/5 px-2 py-1 text-xs text-white/55">
            <TrendIcon trend={composureTrend} /> {composureTrend}
          </div>
        ) : (
          <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${tell.faceLocked ? "bg-ok/15 text-ok" : "bg-danger/15 text-danger"}`}>
            {tell.faceLocked ? "face locked" : "no face"}
          </span>
        )}
      </div>
      {tell.read ? (
        <div className={compact ? "space-y-2" : "space-y-2.5"}>
          <div>
            <div className="mb-1 flex justify-between text-xs"><span className="text-white/50">Composure</span><span className="font-mono text-white">{composure ?? "—"}</span></div>
            <Meter value={composure ?? 0} color={composureColor} />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs"><span className="text-white/50">Bluff signal</span><span className="font-mono text-gold">{tell.bluffLikelihood ?? "—"}%</span></div>
            <Meter value={tell.bluffLikelihood ?? 0} color="bg-gold" />
          </div>
        </div>
      ) : (
        <div className={compact ? "space-y-2" : "space-y-2.5"}>
          <div>
            <div className="mb-1 flex justify-between text-xs"><span className="text-white/50">Composure</span><span className="font-mono text-white/35">—</span></div>
            <Meter value={0} color="bg-white/20" />
          </div>
          <div className="flex justify-between text-xs"><span className="text-white/50">Blinks / min</span><span className="font-mono text-white">{tell.blinkRate ?? "—"}</span></div>
          <div>
            <div className="mb-1 flex justify-between text-xs"><span className="text-white/50">Tension</span><span className="font-mono text-white">{tell.tension ?? "—"}</span></div>
            <Meter value={tell.tension ?? 0} color="bg-gradient-to-r from-ok via-gold to-danger" />
          </div>
        </div>
      )}
      {tell.read ? (
        <>
          <ul className={`${compact ? "mt-2" : "mt-3"} space-y-1`}>
            {tell.evidence.slice(0, compact ? 1 : 2).map((item) => (
              <li key={item} className="flex gap-2 text-xs leading-relaxed text-white/55"><Activity size={12} className="mt-0.5 shrink-0 text-gold/70" />{item}</li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-white/30">Signal confidence {tell.confidence ?? 0}%</p>
        </>
      ) : (
        <p className="mt-2 text-[11px] text-white/30">Composure waiting for their first decision.</p>
      )}
    </article>
  );
}

export function AiReadCard({ player, compact = false }: { player: RailPlayerView; compact?: boolean }) {
  if (!player.aiRead) return null;
  const read = player.aiRead;
  const changed = read.mathAction !== read.finalAction;
  return (
    <article className="overflow-hidden rounded-2xl border border-gold/15 bg-[linear-gradient(145deg,rgba(212,175,55,0.08),rgba(255,255,255,0.02))]">
      <div className={`flex items-center justify-between border-b border-white/8 px-3.5 ${compact ? "py-2.5" : "py-3"}`}>
        <div className="flex items-center gap-2"><Bot size={15} className="text-gold" /><span className="font-semibold text-white">{player.name}&apos;s read</span></div>
        {read.equity !== undefined && <span className="font-mono text-xs text-gold">{read.equity}% equity</span>}
      </div>
      <div className={compact ? "p-3" : "p-3.5"}>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/30">Reading {read.target}</p>
        <div className="mb-3 flex items-center gap-2 text-xs">
          <span className="rounded-md bg-white/5 px-2 py-1 text-white/45">Math: {read.mathAction}</span>
          <span className="text-white/25">→</span>
          <span className={`rounded-md px-2 py-1 font-semibold ${changed ? "bg-gold text-black" : "bg-white/10 text-white"}`}>Play: {read.finalAction}</span>
        </div>
        <p className={`${compact ? "line-clamp-3 text-xs" : "text-sm"} leading-relaxed text-white/65`}>{read.reasoning}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {read.tellsUsed.map((tell) => <span key={tell} className="rounded-full border border-white/8 px-2 py-1 text-[11px] text-white/45"><BrainCircuit size={10} className="mr-1 inline" />{tell}</span>)}
        </div>
        {player.talk && <blockquote className={`${compact ? "text-xs" : "text-sm"} mt-3 border-l-2 border-gold/60 pl-3 italic text-gold/80`}>“{player.talk}”</blockquote>}
      </div>
    </article>
  );
}
