"use client";
import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import type { usePresage } from "@/hooks/usePresage";
import type { RateReading, RejectionReason } from "@/lib/presage/types";
import type { MetricDiagnostics } from "@/lib/presage/diagnostics";
import { historicalRate, pressureStatus, rateStatus, warmupRemaining } from "@/lib/presage/presentation";
import { refreshRate } from "@/lib/presage/quality";

type Presage = ReturnType<typeof usePresage>;
export default function PresagePanel({ presage, cameraOn }: { presage: Presage; cameraOn: boolean }) {
  const { view, error, captureStats, receivedAt } = presage;
  const [clock, setClock] = useState(0);
  // Continue aging values if transport stalls; a frozen response must not freeze a live-looking number.
  useEffect(() => {
    const timer = setInterval(() => setClock(performance.now()), 500);
    return () => clearInterval(timer);
  }, []);
  const now = view.serverNow + Math.max(0, clock - receivedAt);
  const measuring = cameraOn && (view.status === "starting" || view.status === "measuring");
  const latest = view.latest && view.startedAt !== null ? { ...view.latest,
    pulse: refreshRate(view.latest.pulse, view.startedAt, now, view.validation.code, "pulse"),
    breathing: refreshRate(view.latest.breathing, view.startedAt, now, view.validation.code, "breathing"),
  } : null;
  const current = { ...view, serverNow: now, latest };
  const diagnostic = view.diagnostics;
  const pipeline = diagnostic?.pipeline;
  const pipelineFresh = pipeline && now - pipeline.at < 3500;
  const moment = view.moments?.[0];
  return <section aria-label="Pulse and breathing" className="rounded-2xl border border-felt-edge bg-background/70 p-3 text-xs">
    <div className="flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-base text-gold"><Activity size={15} /> Under pressure</h2><span className="font-sans text-muted">Presage · private</span></div>
    <div className="mt-3 grid grid-cols-2 gap-3">
      {(["pulse", "breathing"] as const).map(kind => <Rate key={kind} label={kind === "pulse" ? "Pulse" : "Breathing"} unit={kind === "pulse" ? "BPM" : "/ min"} reading={measuring ? latest?.[kind] : undefined} previous={view.lastGood?.[kind]} baseline={view.baseline[kind]} remaining={warmupRemaining(current, kind)} measuring={measuring} now={now} />)}
    </div>
    <p role="status" className="mt-3 font-sans leading-relaxed text-muted">{pressureStatus(current, measuring, error)}</p>
    {moment && <div className="mt-3 rounded-xl border border-gold/20 bg-gold/5 p-3"><h3 className="text-base">Hand {moment.handNumber}</h3><p className="mt-1 font-sans leading-relaxed">{moment.text}</p><p className="mt-2 font-sans text-muted">{moment.context}</p></div>}
    {diagnostic && <details className="mt-3 border-t border-felt-edge pt-3 font-sans text-muted">
      <summary className="cursor-pointer text-foreground">Signal details</summary>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 tabular-nums">
        <dt>Camera encoded</dt><dd>{measuring ? captureStats.fps : 0} fps</dd>
        <dt>Submitted to Presage</dt><dd>{measuring && pipelineFresh ? pipeline.fps : 0} fps</dd>
        <dt>Frame size</dt><dd>{captureStats.width} × {captureStats.height}</dd>
        <dt>Encode / upload</dt><dd>{captureStats.encodeMs} / {captureStats.uploadMs} ms</dd>
        <dt>Decode / source age</dt><dd>{pipelineFresh ? `${pipeline.decodeMs} / ${pipeline.sourceAgeMs} ms` : "—"}</dd>
        <dt>Skipped frames</dt><dd>{captureStats.dropped + diagnostic.skippedFrames + (pipeline?.dropped ?? 0)}</dd>
      </dl>
      {measuring && pipelineFresh && pipeline.fps < 25 && <p className="mt-2 leading-relaxed">The measurement stream is below the recommended 25 fps. Encoding, upload or processing can limit it even in good light.</p>}
      <p className="mt-3 leading-relaxed">Coverage counts distinct estimates after warm-up, not time in play or accuracy. Rejection reasons can overlap. Missing output is listed separately.</p>
      <MetricDetail label="Pulse" metric={diagnostic.pulse} threshold={diagnostic.policy.pulse} />
      <MetricDetail label="Breathing" metric={diagnostic.breathing} threshold={diagnostic.policy.breathing} />
      <p className="mt-3 leading-relaxed">Cutoff comparisons retain every other quality check. Higher coverage does not establish accuracy. Mouth movement is a camera-derived artifact hint, not confirmed speech.</p>
    </details>}
  </section>;
}
function Rate({ label, unit, reading, previous, baseline, remaining, measuring, now }: { label: string; unit: string; reading?: RateReading; previous?: RateReading | null; baseline: number | null; remaining: number; measuring: boolean; now: number }) {
  const value = reading?.quality === "usable" ? reading.value : null;
  const prior = value === null ? historicalRate(previous, now) : null;
  return <div className="rounded-xl bg-felt/35 p-3"><h3 className="text-base">{label}</h3><p className={`mt-1 font-display text-3xl tabular-nums ${prior ? "text-muted" : ""}`}>{value === null ? prior ? Math.round(prior.value) : "—" : Math.round(value)} <span className="font-sans text-xs text-muted">{unit}</span></p>
    {prior && <p className="mt-1 font-sans text-[10px] text-gold">Previous estimate · {prior.age}s ago</p>}
    <p className="mt-1 min-h-7 font-sans text-[10px] text-muted">{rateStatus(reading, remaining, measuring)}</p>{value !== null && baseline !== null && <p className="mt-1 font-sans text-[10px] text-muted">{value - baseline >= 0 ? "+" : ""}{Math.round(value - baseline)} from starting reference</p>}</div>;
}
const labels: Record<RejectionReason, string> = { warming: "Warm-up", missing: "No estimate", stale: "Delayed estimate", tracking: "Tracking", unstable: "Unstable", confidence: "Confidence", range: "Supported range", motion: "Movement", mouth_movement: "Mouth movement" };
function MetricDetail({ label, metric, threshold }: { label: string; metric: MetricDiagnostics; threshold: number }) {
  return <div className="mt-3 rounded-xl bg-felt/30 p-3"><h3 className="text-base text-foreground">{label}</h3><p className="mt-1">{metric.usable}/{metric.samples} usable estimates ({metric.coverage}%) · cutoff {threshold}</p><p className="mt-1">Current confidence: {metric.confidence === null ? "No output" : `${metric.confidence}%`}</p><p className="mt-1">{metric.reasons.length ? metric.reasons.map(r => labels[r]).join(" · ") : metric.samples ? "Latest estimate passed" : "Waiting for estimates"}</p>
    {Object.keys(metric.rejected).length > 0 && <p className="mt-2">{Object.entries(metric.rejected).map(([r, count]) => `${labels[r as RejectionReason]}: ${count}`).join(" · ")}</p>}
    <div className="mt-3 grid grid-cols-5 gap-1 text-center tabular-nums">{metric.cutoffs.map(c => <div key={c.threshold}><span className="block">≥{c.threshold}</span><span className="mt-1 block text-foreground">{metric.samples ? `${c.coverage}%` : "—"}</span></div>)}</div>
  </div>;
}
