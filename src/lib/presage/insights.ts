import { referenceRate } from "./quality";
import type { PressureEvent, PressureMoment, VitalsSample } from "./types";

/** Descriptive within-player feedback. No causal attribution, bluff label, or emotion score. */
export function pressureMoments(history: VitalsSample[], events: PressureEvent[], playerId: string): PressureMoment[] {
  return events.filter(e => e.kind === "end").slice(-3).reverse().flatMap(end => {
    const start = events.find(e => e.kind === "start" && e.handNumber === end.handNumber);
    if (!start) return [];
    const actions = events.filter(e => e.kind === "action" && e.playerId === playerId && e.handNumber === end.handNumber);
    if (!actions.length) return [];
    const rates = [...new Map(history.filter(s => s.pulse.quality === "usable" && s.pulse.windowStart >= start.at && s.pulse.windowEnd <= end.at).map(s => [s.pulse.windowEnd, s.pulse])).values()];
    const baseline = referenceRate(history.filter(s => s.pulse.windowEnd < start.at).map(s => s.pulse));
    const values = rates.map(r => r.value!).sort((a, b) => a - b);
    const median = values.length >= 3 ? Math.round(values[Math.floor(values.length / 2)]) : null;
    const latencies = actions.map(a => a.latencyMs).filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
    const longest = latencies.length ? `${(Math.max(...latencies) / 1000).toFixed(1)}s on your longest decision.` : `${actions.length} decisions this hand.`;
    const change = baseline === null || median === null ? "" : ` (${median - Math.round(baseline) >= 0 ? "+" : ""}${median - Math.round(baseline)} from your starting reference)`;
    return [{ handNumber: end.handNumber,
      text: median === null ? latencies.length ? `You took ${longest}` : `You made ${actions.length} decisions this hand.` : `Your median pulse was ${median} BPM${change}.`,
      context: median === null ? "No sufficiently supported pulse summary for this hand. Decision history remains available." : `${rates.length} valid, overlapping 12-second estimates within this hand. ${longest} These windows cannot isolate a reaction to one action.`,
      challenge: "On your next call, compare the price with the pot and consider your opponent’s range before acting.",
    }];
  });
}
