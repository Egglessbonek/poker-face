"use client";

/**
 * The Reveal: per human player, what their face said vs what their cards were.
 * Charts: one measure per chart (no dual axes). Bluff likelihood per aggressive decision, colored by
 * whether it really was a bluff; arousal over the match as a line.
 */

import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PlayingCard } from "@/components/Card";
import type { Achievement, RevealData, RevealDecision, RevealPlayer } from "@/lib/game/reveal";

const INK = { primary: "#ece7dc", muted: "#8a8f8b", grid: "#1d5c47" };
const BLUFF = "#e5484d"; // status: caught
const VALUE = "#46a758"; // status: honest
const NEUTRAL = "#d4af37";
const TONE: Record<Achievement["tone"], string> = { gold: "text-gold", danger: "text-danger", ok: "text-ok", muted: "text-muted" };

/** Per human player id: where this match's face stands among every face read since the server started. */
export type HallRanks = Record<string, { rank: number; of: number }>;

export default function RevealView({ data, ranks = {} }: { data: RevealData; ranks?: HallRanks }) {
  const seatName = (seat: number) => data.players.find((p) => p.seat === seat)?.name ?? `Seat ${seat + 1}`;
  // The proof the whole product exists for. It leads the page when there is any; the empty state goes last.
  const moments = (
      <section>
        <h2 className="mb-3 text-lg font-medium">When the tells changed an AI&apos;s mind</h2>
        {data.tellMoments.length === 0 ? (
          <p className="text-sm text-muted">The AIs never deviated from the math on a tell. Either nobody leaked, or nobody had a camera on.</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {data.tellMoments.slice(0, 12).map((m, i) => (
              <li key={i} className="rounded-2xl border border-felt-edge p-4 text-sm">
                <p className="text-xs text-muted">Hand {m.handNumber} · {m.street}</p>
                <p className="font-medium">
                  {m.aiName} {m.decision.action}{m.decision.amount ? ` ${m.decision.amount}` : ""}
                  {m.decision.mathAction !== m.decision.action && <span className="text-gold"> — without your tells the math said {m.decision.mathAction}</span>}
                </p>
                <p className="mt-1 text-muted">{m.decision.reasoning}</p>
                {m.decision.tellsUsed.length > 0 && <p className="mt-1 text-danger">used: {m.decision.tellsUsed.join(", ")}</p>}
                {m.decision.tableTalk && <p className="mt-1 italic">“{m.decision.tableTalk}”</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
  );
  return (
    <main className="flex flex-1 flex-col gap-10 px-4 py-8 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gold">The Reveal · table {data.code}</p>
          <h1 className="text-3xl font-semibold">What your face gave away</h1>
          <p className="text-sm text-muted">{data.hands.length} hands · {data.aiDecisions} AI decisions · tells changed {data.aiTellChanged} of them</p>
        </div>
        <ol className="rounded-2xl border border-felt-edge text-sm">
          {data.standings.map((s, i) => (
            <li key={s.playerId} className="flex justify-between gap-6 px-4 py-1.5 first:pt-3 last:pb-3">
              <span><span className="mr-2 font-mono text-muted">{i + 1}</span>{s.name}</span>
              <span className="font-mono">{s.stack} <span className={s.net >= 0 ? "text-ok" : "text-danger"}>({s.net >= 0 ? "+" : ""}{s.net})</span></span>
            </li>
          ))}
        </ol>
      </header>

      {data.tellMoments.length > 0 && moments}
      {data.humans.map((h) => <HumanSection key={h.player.id} h={h} rank={ranks[h.player.id]} />)}
      {data.tellMoments.length === 0 && moments}

      <section>
        <h2 className="mb-3 text-lg font-medium">Every hand, every card</h2>
        <div className="overflow-x-auto rounded-2xl border border-felt-edge">
          <table className="w-full text-left text-xs">
            <thead className="bg-background/60 text-muted">
              <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Board</th><th className="px-3 py-2">Hole cards</th><th className="px-3 py-2">Result</th></tr>
            </thead>
            <tbody>
              {data.hands.map((h) => (
                <tr key={h.handNumber} className="border-t border-felt-edge/50 align-top">
                  <td className="px-3 py-2 font-mono">{h.handNumber}</td>
                  <td className="px-3 py-2"><div className="flex gap-1">{h.board.map((c) => <PlayingCard key={c} card={c} size="sm" />)}</div></td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-3">
                      {Object.entries(h.holeCards).map(([seat, cards]) => (
                        <div key={seat} className="flex items-center gap-1"><span className="mr-1 text-muted">{seatName(Number(seat))}</span>{cards.map((c) => <PlayingCard key={c} card={c} size="sm" />)}</div>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {(h.results ?? []).filter((r) => r.won > 0).map((r) => <p key={r.seat}>{seatName(r.seat)} +{r.won}{r.descr ? ` · ${r.descr}` : ""}</p>)}
                    {h.foldedOut && <p className="text-muted">everyone else folded</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">Players: {data.players.map((p) => `${p.name}${p.kind === "ai" ? " (AI)" : ""}`).join(" · ")}</p>
      </section>
    </main>
  );
}

function hallLine(r: { rank: number; of: number }): string {
  if (r.of === 1) return "The first face read on this server tonight. Bring a friend.";
  if (r.rank === 1) return `#1 poker face of the ${r.of} read on this server tonight.`;
  return `#${r.rank} of ${r.of} poker faces read on this server tonight.`;
}

function HumanSection({ h, rank }: { h: RevealPlayer; rank?: { rank: number; of: number } }) {
  const graded = h.decisions.filter((d) => d.aggressive && d.tells);
  const withTells = h.decisions.filter((d) => d.tells);
  const chart = graded.map((d, i) => ({ i: i + 1, label: `H${d.handNumber} ${d.street}`, bluff: Math.round(d.tells!.bluffLikelihood * 100), isBluff: d.isBluff, equity: Math.round(d.equity * 100), action: `${d.action.type}${d.action.amount ? " " + d.action.amount : ""}` }));
  const arousal = withTells.map((d, i) => ({ i: i + 1, label: `H${d.handNumber} ${d.street}`, arousal: d.tells!.arousal }));
  const bluffs = h.decisions.filter((d) => d.isBluff);
  const caught = bluffs.filter((d) => d.tells && d.tells.bluffLikelihood >= 0.5).length;

  return (
    <section className="flex flex-col gap-5 rounded-3xl border border-felt-edge p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gold">{h.player.name}</p>
          <h2 className="text-2xl font-semibold">{verdict(h)}</h2>
          {rank && <p className="mt-1 text-sm text-gold">{hallLine(rank)}</p>}
          {h.achievements.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {h.achievements.map((a) => (
                <li key={a.id} className={`rounded-full border border-felt-edge px-2.5 py-0.5 text-xs ${TONE[a.tone]}`}>
                  <span className="font-semibold">{a.title}</span>
                  <span className="text-muted"> · {a.blurb}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex gap-6 text-center">
          <Stat label="Poker face" value={h.pokerFace === null ? "—" : `${h.pokerFace}`} unit={h.pokerFace === null ? "" : "/100"} />
          <Stat label="Bluffs" value={String(bluffs.length)} unit={bluffs.length ? ` · ${caught} caught` : ""} />
          <Stat label="Reads right" value={h.readsTotal ? `${h.readsRight}/${h.readsTotal}` : "—"} />
        </div>
      </div>

      {chart.length > 0 ? (
        <div>
          <p className="mb-1 text-sm font-medium">How bluffy you looked on each bet <span className="text-muted">(red = it really was a bluff, green = you had it)</span></p>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 8, right: 8, left: -20, bottom: 0 }} barCategoryGap={2}>
                <CartesianGrid vertical={false} stroke={INK.grid} strokeOpacity={0.5} />
                <XAxis dataKey="label" tick={{ fill: INK.muted, fontSize: 10 }} tickLine={false} axisLine={{ stroke: INK.grid }} interval={0} angle={-30} height={44} textAnchor="end" />
                <YAxis domain={[0, 100]} tick={{ fill: INK.muted, fontSize: 10 }} tickLine={false} axisLine={false} unit="%" />
                <ReferenceLine y={50} stroke={INK.muted} strokeDasharray="3 3" />
                <Tooltip cursor={{ fill: INK.grid, fillOpacity: 0.3 }} content={<BluffTip />} />
                <Bar dataKey="bluff" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {chart.map((d) => <Cell key={d.i} fill={d.isBluff ? BLUFF : VALUE} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted">{withTells.length ? "The camera was on, but you never bet or raised, so there was nothing to grade. Bluff at least once next time." : "No bets or raises with tell data. Turn the camera on next time and the AIs will show you what they saw."}</p>
      )}

      {arousal.length > 2 && (
        <div>
          <p className="mb-1 text-sm font-medium">Arousal across the match</p>
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={arousal} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={INK.grid} strokeOpacity={0.5} />
                <XAxis dataKey="label" tick={{ fill: INK.muted, fontSize: 10 }} tickLine={false} axisLine={{ stroke: INK.grid }} interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} tick={{ fill: INK.muted, fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "#0b0f0d", border: `1px solid ${INK.grid}`, fontSize: 12 }} labelStyle={{ color: INK.muted }} itemStyle={{ color: INK.primary }} />
                <Line type="monotone" dataKey="arousal" stroke={NEUTRAL} strokeWidth={2} dot={{ r: 3, fill: NEUTRAL }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-medium">Biggest leaks</p>
          {h.leaks.length ? (
            <ul className="flex flex-col gap-1 text-sm">
              {h.leaks.map((l) => (
                <li key={l.signal} className="flex justify-between gap-3">
                  <span className={l.direction === "bluff" ? "text-danger" : l.direction === "strength" ? "text-ok" : "text-muted"}>{l.text}</span>
                  <span className="font-mono text-muted">×{l.count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">nothing notable recorded</p>
          )}
          {h.peakArousal && <p className="mt-2 text-xs text-muted">Peak arousal {h.peakArousal.arousal}/100 on hand {h.peakArousal.handNumber}.</p>}
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">Your bluffs, on the record</p>
          {bluffs.length ? (
            <ul className="flex flex-col gap-2 text-sm">
              {bluffs.slice(0, 6).map((d, i) => <BluffRow key={i} d={d} />)}
            </ul>
          ) : (
            <p className="text-sm text-muted">You never bet without the goods. Honest to a fault.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function BluffRow({ d }: { d: RevealDecision }) {
  const caught = !!d.tells && d.tells.bluffLikelihood >= 0.5;
  return (
    <li className="flex items-center gap-3 rounded-xl bg-background/60 px-3 py-2">
      <div className="flex gap-1">{d.holeCards.map((c) => <PlayingCard key={c} card={c} size="sm" />)}</div>
      <div className="flex-1 text-xs">
        <p>Hand {d.handNumber}, {d.street}: {d.action.type}{d.action.amount ? ` to ${d.action.amount}` : ""} with {Math.round(d.equity * 100)}% equity</p>
        <p className="text-muted">{d.tells ? `face said ${Math.round(d.tells.bluffLikelihood * 100)}% bluff${d.tells.evidence.length ? ` · ${d.tells.evidence[0].text}` : ""}` : "no tell data"}</p>
      </div>
      <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${caught ? "bg-danger/80" : "bg-ok/80"}`}>{caught ? "caught" : "got away"}</span>
    </li>
  );
}

function BluffTip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { label: string; bluff: number; equity: number; action: string; isBluff: boolean } }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-felt-edge bg-background px-3 py-2 text-xs">
      <p className="text-muted">{d.label} · {d.action}</p>
      <p>Face: {d.bluff}% bluff</p>
      <p>Cards: {d.equity}% equity → {d.isBluff ? "a bluff" : "a real hand"}</p>
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-muted">{label}</p>
      <p className="font-mono text-2xl">{value}<span className="text-sm text-muted">{unit}</span></p>
    </div>
  );
}

function verdict(h: RevealPlayer): string {
  if (h.pokerFace === null) return h.decisions.some((d) => d.tells) ? "Never bet, never bluffed, never graded." : "No camera, no verdict.";
  if (h.pokerFace >= 70) return "Stone cold. Your face told them nothing.";
  if (h.pokerFace >= 50) return "Mostly unreadable, with a few cracks.";
  if (h.pokerFace >= 30) return "Your face was talking. They were listening.";
  return "An open book. Every bluff had a caption.";
}
