"use client";

import BluffMeter from "@/components/BluffMeter";
import { decidingHeadMotion } from "@/lib/tells/baseline";
import { dominantEmotion } from "@/lib/tells/emotion";
import type { BaselineStats, Emotion, TellFrame, TellVector } from "@/lib/types";

const EMOTIONS: Emotion[] = ["neutral", "happy", "surprise", "fear", "anger", "disgust", "sad"];

export default function TellHUD({ frame, baseline, vector, cameraStatus }: { frame: TellFrame | null; baseline: BaselineStats | null; vector: TellVector | null; cameraStatus: string }) {
  // Stillness is relative to how the player usually sits while deciding (calibration until the first decision).
  const usual = baseline ? (decidingHeadMotion(baseline) ?? baseline.headMotion) : null;
  const stillness = frame && usual ? Math.min(2, frame.headMotion / usual) : null;
  const blinkRatio = frame && baseline ? frame.blinkRate / baseline.blinkRate : null;
  return (
    <aside className="flex flex-col gap-4 rounded-2xl border border-felt-edge p-4 text-xs">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gold">What the table sees</p>
        <span className="font-mono text-[10px] text-muted">{cameraStatus}{frame && !frame.facePresent ? " · no face" : ""}</span>
      </div>

      {frame ? (
        <>
          <Gauge label="Blink rate" value={frame.blinkRate} unit="/min" ratio={blinkRatio} hint={blinkRatio && blinkRatio > 1.5 ? "elevated" : undefined} />
          <Gauge label="Stillness" value={stillness === null ? null : 1 - Math.min(1, stillness)} ratio={null} hint={stillness !== null && stillness < 0.4 ? "frozen" : undefined} bar />
          <Gauge label="Tension" value={frame.tension} ratio={null} bar hint={baseline && frame.tension - baseline.tension > 0.1 ? "up" : undefined} />
          <Gauge label="Smile" value={frame.smile} ratio={null} bar hint={frame.duchenne ? "genuine" : frame.fakeSmile ? "forced" : undefined} />
          <div className="flex justify-between"><span className="text-muted">Gaze</span><span className="font-mono">{frame.gaze}</span></div>
          <div>
            <div className="mb-1 flex justify-between"><span className="text-muted">Emotion</span><span className="font-mono">{dominantEmotion(frame.emotion)}</span></div>
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-background">
              {EMOTIONS.map((e) => (
                <div key={e} title={e} className="h-full" style={{ width: `${Math.round(frame.emotion[e] * 100)}%`, background: EMOTION_COLOR[e] }} />
              ))}
            </div>
          </div>
        </>
      ) : (
        <p className="text-muted">Camera not started</p>
      )}

      {vector && (
        <div className="flex flex-col gap-2 border-t border-felt-edge pt-3">
          <BluffMeter value={vector.bluffLikelihood} />
          <div className="flex justify-between"><span className="text-muted">Composure</span><span className="font-mono">{100 - vector.arousal} · {vector.trend === "rising" ? "falling" : vector.trend === "falling" ? "rising" : vector.trend}</span></div>
          <ul className="flex flex-col gap-1">
            {vector.evidence.map((e, i) => (
              <li key={i} className={e.direction === "bluff" ? "text-danger" : e.direction === "strength" ? "text-ok" : "text-muted"}>• {e.text}</li>
            ))}
            {vector.evidence.length === 0 && <li className="text-muted">no notable tells on that decision</li>}
          </ul>
        </div>
      )}
    </aside>
  );
}

const EMOTION_COLOR: Record<Emotion, string> = { neutral: "#8a8f8b", happy: "#d4af37", surprise: "#7cc4ff", fear: "#b28dff", anger: "#e5484d", disgust: "#46a758", sad: "#4a6fa5" };

function Gauge({ label, value, unit, ratio, hint, bar }: { label: string; value: number | null; unit?: string; ratio: number | null; hint?: string; bar?: boolean }) {
  return (
    <div>
      <div className="flex justify-between">
        <span className="text-muted">{label}</span>
        <span className="font-mono">
          {value === null ? "—" : bar ? `${Math.round(value * 100)}%` : `${value.toFixed(0)}${unit ?? ""}`}
          {ratio !== null && ratio !== undefined && <span className="text-muted"> ({ratio.toFixed(1)}x)</span>}
          {hint && <span className="ml-1 text-gold">{hint}</span>}
        </span>
      </div>
      {bar && value !== null && (
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-background">
          <div className="h-full bg-gold" style={{ width: `${Math.round(Math.min(1, value) * 100)}%` }} />
        </div>
      )}
    </div>
  );
}
