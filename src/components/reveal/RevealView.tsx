"use client";

/**
 * The Reveal: per human player, what their face said vs what their cards were.
 * Charts: one measure per chart (no dual axes). Bluff likelihood per aggressive decision, colored by
 * whether it really was a bluff; arousal over the match as a line.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, BrainCircuit, Eye, Home, Sparkles, Spade, Trophy, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PlayingCard } from "@/components/Card";
import type { Achievement, RevealData, RevealDecision, RevealPlayer, TellMoment } from "@/lib/game/reveal";

const INK = { primary: "#ece7dc", muted: "#8a8f8b", grid: "#1d5c47" };
const BLUFF = "#e5484d"; // status: caught
const VALUE = "#46a758"; // status: honest
const NEUTRAL = "#d4af37";
const TONE: Record<Achievement["tone"], string> = { gold: "text-gold", danger: "text-danger", ok: "text-ok", muted: "text-muted" };

/** Per human player id: where this match's face stands among every face read since the server started. */
export type HallRanks = Record<string, { rank: number; of: number }>;

export default function RevealView({ data, ranks = {} }: { data: RevealData; ranks?: HallRanks }) {
  const [selectedMoment, setSelectedMoment] = useState<TellMoment | null>(null);
  const seatName = (seat: number) => data.players.find((p) => p.seat === seat)?.name ?? `Seat ${seat + 1}`;
  const importantMoments = [...data.tellMoments].sort((a, b) => Number(!!b.caughtBluff) - Number(!!a.caughtBluff));
  // The proof the whole product exists for. It leads the page when there is any; the empty state goes last.
  const moments = (
      <section aria-labelledby="important-moments-title">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-gold">Important moments</p>
            <h2 id="important-moments-title" className="mt-1 text-2xl font-medium">When the tells changed an AI&apos;s mind</h2>
          </div>
          {data.tellMoments.length > 0 && <p className="text-xs text-muted">Select a moment for the full decision breakdown</p>}
        </div>
        {data.tellMoments.length === 0 ? (
          <div className="rounded-2xl border border-felt-edge/60 bg-felt/[0.04] p-5">
            <p className="text-sm text-muted">The AIs never deviated from the math on a tell. Either nobody leaked, or nobody had a camera on.</p>
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {importantMoments.slice(0, 12).map((moment, i) => <MomentCard key={`${moment.handNumber}-${moment.street}-${i}`} moment={moment} onOpen={() => setSelectedMoment(moment)} />)}
          </ul>
        )}
      </section>
  );
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-6 sm:gap-10 sm:px-8 sm:py-10 lg:py-12">
      <header className="flex w-full shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/8 pb-3">
        <div className="flex items-center gap-4">
          <div className="hidden h-9 w-9 items-center justify-center rounded-full bg-gold text-black sm:flex">
            <Spade size={17} fill="currentColor" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-gold">Poker Face · Reveal</p>
            <p className="mt-0.5 font-display text-xl font-semibold text-white">Table <span className="font-mono text-gold">{data.code}</span></p>
          </div>
          <span className="flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-gold">
            <Trophy size={12} /> Complete
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link href="/" aria-label="Back to home" className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-white/55 transition-colors hover:border-gold/40 hover:text-gold">
            <Home size={14} /> <span className="hidden sm:inline">Home</span>
          </Link>
        </div>
      </header>

      <section className="grid gap-5 border-b border-felt-edge/70 pb-8 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] lg:items-end">
        <div className="min-w-0 max-w-2xl">
          <p className="text-xs uppercase tracking-[0.3em] text-gold">Post-match analysis</p>
          <h1 className="mt-1 text-3xl font-semibold leading-tight sm:text-4xl">What your face gave away</h1>
          <p className="mt-2 text-sm text-muted">{data.hands.length} hands · {data.aiDecisions} AI decisions · tells changed {data.aiTellChanged} of them</p>
        </div>
        <ol className="w-full overflow-hidden rounded-2xl border border-felt-edge bg-felt/10 text-sm lg:justify-self-end">
          {data.standings.map((s, i) => (
            <li key={s.playerId} className="flex items-center justify-between gap-6 border-b border-felt-edge/50 px-4 py-3 last:border-b-0">
              <span className="min-w-0 truncate"><span className="mr-3 font-mono text-muted">{i + 1}</span>{s.name}</span>
              <span className="shrink-0 font-mono">{s.stack} <span className={s.net >= 0 ? "text-ok" : "text-danger"}>({s.net >= 0 ? "+" : ""}{s.net})</span></span>
            </li>
          ))}
        </ol>
      </section>

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

      {selectedMoment && <MomentModal moment={selectedMoment} seatName={seatName} onClose={() => setSelectedMoment(null)} />}
    </main>
  );
}

function MomentCard({ moment, onOpen }: { moment: TellMoment; onOpen: () => void }) {
  const read = moment.caughtBluff ?? moment.reads[0];
  const caught = !!moment.caughtBluff;
  return (
    <li>
      <button type="button" onClick={onOpen} className={`group flex h-full w-full flex-col rounded-2xl border p-5 text-left transition duration-200 hover:-translate-y-0.5 hover:border-gold/60 hover:bg-gold/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${caught ? "border-danger/50 bg-danger/[0.06]" : "border-felt-edge bg-felt/[0.04]"}`}>
        <div className="flex w-full items-center justify-between gap-3">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${caught ? "bg-danger/15 text-danger" : "bg-gold/10 text-gold"}`}>
            {caught ? <Eye size={12} /> : <Sparkles size={12} />}{caught ? "Bluff caught" : "Tell changed the play"}
          </span>
          <span className="text-xs text-muted">Hand {moment.handNumber} · {moment.street}</span>
        </div>
        <h3 className="mt-4 text-xl leading-tight">{caught && read ? `${moment.aiName} caught ${read.name}'s bluff` : `${moment.aiName} overruled the math`}</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-md bg-white/5 px-2 py-1 text-muted">Math: {moment.decision.mathAction}</span>
          <ArrowRight size={14} className="text-gold" />
          <span className="rounded-md bg-gold px-2 py-1 font-semibold text-background">Play: {actionText(moment.decision)}</span>
        </div>
        {read && <p className="mt-3 text-sm text-muted">{read.name}&apos;s face read <span className="font-mono text-foreground">{Math.round(read.bluffLikelihood * 100)}% bluff</span>.</p>}
        {read?.evidence.length ? (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {read.evidence.slice(0, 2).map((evidence) => <li key={evidence.signal} className="rounded-full border border-white/10 px-2 py-1 text-[11px] text-white/55">{evidence.text}</li>)}
          </ul>
        ) : null}
        <span className="mt-auto flex items-center gap-1.5 pt-5 text-xs font-semibold text-gold">View decision breakdown <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" /></span>
      </button>
    </li>
  );
}

function MomentModal({ moment, seatName, onClose }: { moment: TellMoment; seatName: (seat: number) => string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const read = moment.caughtBluff ?? moment.reads[0];
  const result = moment.result;
  const potWon = result?.pots?.reduce((sum, pot) => sum + pot.amount, 0);
  const winners = result?.results?.filter((entry) => entry.won > 0) ?? [];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  return (
    <dialog ref={dialogRef} onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} className="m-auto max-h-[92dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-3xl border border-felt-edge bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/80">
      <article>
        <header className={`sticky top-0 z-10 border-b px-5 py-5 sm:px-7 ${moment.caughtBluff ? "border-danger/30 bg-[#160f0f]" : "border-gold/25 bg-[#15150f]"}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className={`text-xs font-semibold uppercase tracking-[0.28em] ${moment.caughtBluff ? "text-danger" : "text-gold"}`}>{moment.caughtBluff ? "Successful bluff catch" : "Tell-driven decision"}</p>
              <h2 className="mt-1 text-2xl leading-tight sm:text-3xl">Hand {moment.handNumber}: {moment.aiName} changed course</h2>
              <p className="mt-1 text-sm text-muted">{moment.street} · math said {moment.decision.mathAction}, tells said {actionText(moment.decision)}</p>
            </div>
            <button type="button" autoFocus onClick={onClose} aria-label="Close decision breakdown" className="rounded-full border border-white/10 p-2 text-muted transition-colors hover:border-gold/40 hover:text-gold"><X size={17} /></button>
          </div>
        </header>

        <div className="space-y-7 p-5 sm:p-7">
          <section>
            <h3 className="mb-3 text-lg">The situation before the decision</h3>
            {moment.situation ? (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <ModalStat label="Pot" value={String(moment.situation.pot)} />
                  <ModalStat label="To call" value={String(moment.situation.toCall)} />
                  <ModalStat label={`${moment.aiName} equity`} value={`${Math.round(moment.aiEquity * 100)}%`} />
                  <ModalStat label="Position" value={moment.situation.aiPosition} />
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <CardGroup label={`${moment.aiName}'s cards`} cards={moment.situation.aiHoleCards} />
                  <CardGroup label="Board at the decision" cards={moment.situation.board} empty="Preflop — no board yet" />
                </div>
                {moment.situation.actions.length > 0 && (
                  <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.025] p-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Action leading in</p>
                    <ol className="space-y-1 text-sm text-white/70">
                      {moment.situation.actions.slice(-5).map((action, index) => <li key={`${action.at}-${index}`}><span className="text-foreground">{seatName(action.seat)}</span> {actionText(action)}</li>)}
                    </ol>
                  </div>
                )}
              </>
            ) : (
              <p className="rounded-2xl border border-white/8 bg-white/[0.025] p-4 text-sm text-muted">The exact pot snapshot is unavailable for this older match, but the tell read and completed hand are still on the record.</p>
            )}
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-gold/25 bg-gold/[0.05] p-4">
              <div className="flex items-center gap-2 text-gold"><BrainCircuit size={16} /><h3 className="text-lg">What the AI saw</h3></div>
              {read ? (
                <>
                  <p className="mt-3 text-sm">Reading <strong>{read.name}</strong>: <span className="font-mono text-xl text-gold">{Math.round(read.bluffLikelihood * 100)}%</span> bluff</p>
                  <p className="mt-1 text-xs text-muted">Signal confidence {Math.round(read.confidence * 100)}%</p>
                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">Tells used in the decision</p>
                    {moment.decision.tellsUsed.length > 0 ? (
                      <ul className="mt-2 space-y-1 text-sm text-foreground">
                        {moment.decision.tellsUsed.map((tell) => <li key={tell}>• {tell}</li>)}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm text-white/65">The tell-adjusted strategy used the combined bluff score; it did not cite an individual signal.</p>
                    )}
                  </div>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted">Supporting metrics captured</p>
                  <ul className="mt-3 space-y-2">
                    {read.evidence.map((evidence) => (
                      <li key={evidence.signal} className="rounded-xl border border-white/8 bg-background/40 p-3 text-sm">
                        <p>{evidence.text}</p>
                        <p className="mt-1 font-mono text-[11px] uppercase text-muted">{Math.round(evidence.strength * 100)}% signal strength · {signalName(evidence.signal)}</p>
                      </li>
                    ))}
                  </ul>
                </>
              ) : <p className="mt-3 text-sm text-muted">No opponent read was retained for this decision.</p>}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
              <div className="flex items-center gap-2"><Eye size={16} className="text-danger" /><h3 className="text-lg">What was really happening</h3></div>
              {read?.actual ? (
                <>
                  <p className={`mt-3 text-sm font-semibold ${read.actual.isBluff ? "text-danger" : "text-ok"}`}>{read.actual.isBluff ? `${read.name} was bluffing.` : `${read.name} had a value hand.`}</p>
                  <div className="mt-3"><CardGroup label={`${read.name}'s cards`} cards={read.actual.holeCards} /></div>
                  <p className="mt-3 text-sm text-muted">{actionText(read.actual.action)} with <span className="font-mono text-foreground">{Math.round(read.actual.equity * 100)}% equity</span> at the time.</p>
                </>
              ) : <p className="mt-3 text-sm text-muted">The matching human action could not be reconstructed for this older decision.</p>}
            </div>
          </section>

          <section className="rounded-2xl border border-felt-edge bg-felt/[0.06] p-4">
            <div className="flex items-center gap-2 text-gold"><Trophy size={16} /><h3 className="text-lg">How the hand ended</h3></div>
            {result ? (
              <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                <div>
                  <CardGroup label="Final board" cards={result.board} empty="No board — the hand ended preflop" />
                  <div className="mt-3 text-sm">
                    {winners.map((winner) => <p key={winner.seat}><strong>{seatName(winner.seat)}</strong> won <span className="font-mono text-gold">{winner.won}</span>{winner.descr ? ` with ${winner.descr}` : ""}.</p>)}
                    {result.foldedOut && <p className="text-muted">Everyone else folded.</p>}
                  </div>
                </div>
                {potWon !== undefined && <ModalStat label="Total pot" value={String(potWon)} />}
              </div>
            ) : <p className="mt-3 text-sm text-muted">No completed result was recorded for this hand.</p>}
          </section>

          {moment.decision.reasoning && <blockquote className="border-l-2 border-gold/50 pl-4 text-sm leading-relaxed text-white/65"><span className="text-xs font-semibold uppercase tracking-wider text-gold">AI reasoning</span><br />{moment.decision.reasoning}</blockquote>}
        </div>
      </article>
    </dialog>
  );
}

function ModalStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/8 bg-white/[0.025] px-3 py-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</p><p className="mt-1 font-mono text-lg text-foreground">{value}</p></div>;
}

function CardGroup({ label, cards, empty = "No cards" }: { label: string; cards: RevealDecision["holeCards"]; empty?: string }) {
  return <div><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>{cards.length ? <div className="flex flex-wrap gap-1">{cards.map((card) => <PlayingCard key={card} card={card} size="sm" />)}</div> : <p className="text-sm text-muted">{empty}</p>}</div>;
}

function actionText(action: { action: string; amount?: number } | RevealDecision["action"]): string {
  const type = "type" in action ? action.type : action.action;
  return `${type}${action.amount ? ` ${action.amount}` : ""}`;
}

function signalName(signal: string): string {
  return signal.replaceAll("_", " ");
}

function hallLine(r: { rank: number; of: number }): string {
  if (r.of === 1) return "The first face read on this server tonight. Bring a friend.";
  if (r.rank === 1) return `#1 on the leaderboard tonight, of ${r.of} faces read.`;
  return `#${r.rank} of ${r.of} on the leaderboard tonight.`;
}

function HumanSection({ h, rank }: { h: RevealPlayer; rank?: { rank: number; of: number } }) {
  const graded = h.decisions.filter((d) => d.aggressive && d.tells);
  const withTells = h.decisions.filter((d) => d.tells);
  const chart = graded.map((d, i) => ({ i: i + 1, label: `H${d.handNumber} ${d.street}`, bluff: Math.round(d.tells!.bluffLikelihood * 100), isBluff: d.isBluff, equity: Math.round(d.equity * 100), action: `${d.action.type}${d.action.amount ? " " + d.action.amount : ""}` }));
  const composure = withTells.map((d, i) => ({ i: i + 1, label: `H${d.handNumber} ${d.street}`, composure: 100 - d.tells!.arousal }));
  const bluffs = h.decisions.filter((d) => d.isBluff);
  const caught = bluffs.filter((d) => d.tells && d.tells.bluffLikelihood >= 0.5).length;

  return (
    <section className="flex flex-col gap-6 rounded-3xl border border-felt-edge bg-felt/[0.04] p-4 sm:p-6 lg:p-7">
      <div className="grid gap-5 border-b border-felt-edge/50 pb-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.3em] text-gold">{h.player.name}</p>
          <h2 className="mt-1 text-2xl font-semibold leading-tight sm:text-3xl">{verdict(h)}</h2>
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
        <div className="grid w-full grid-cols-3 gap-2 text-center sm:w-auto sm:gap-3">
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

      {composure.length > 2 && (
        <div>
          <p className="mb-1 text-sm font-medium">Composure across the match</p>
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={composure} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={INK.grid} strokeOpacity={0.5} />
                <XAxis dataKey="label" tick={{ fill: INK.muted, fontSize: 10 }} tickLine={false} axisLine={{ stroke: INK.grid }} interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} tick={{ fill: INK.muted, fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "#0b0f0d", border: `1px solid ${INK.grid}`, fontSize: 12 }} labelStyle={{ color: INK.muted }} itemStyle={{ color: INK.primary }} />
                <Line type="monotone" dataKey="composure" stroke={NEUTRAL} strokeWidth={2} dot={{ r: 3, fill: NEUTRAL }} isAnimationActive={false} />
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
          {h.peakArousal && <p className="mt-2 text-xs text-muted">Lowest composure {100 - h.peakArousal.arousal}/100 on hand {h.peakArousal.handNumber}.</p>}
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
    <div className="min-w-0 rounded-2xl border border-felt-edge/60 bg-background/45 px-2 py-3 sm:min-w-28 sm:px-3">
      <p className="text-[10px] uppercase tracking-widest text-muted">{label}</p>
      <p className="mt-1 font-mono text-xl sm:text-2xl">{value}<span className="text-xs text-muted sm:text-sm">{unit}</span></p>
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
