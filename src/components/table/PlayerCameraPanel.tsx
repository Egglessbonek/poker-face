"use client";

import { Camera, CameraOff } from "lucide-react";
import WebcamFeed from "@/components/WebcamFeed";
import PresagePanel from "@/components/presage/PresagePanel";
import type { useTells } from "@/hooks/useTells";
import type { usePresage } from "@/hooks/usePresage";

interface Props {
  tells: ReturnType<typeof useTells>;
  presage: ReturnType<typeof usePresage>;
  setupOpen: boolean;
  onSetup: () => void;
  onStop: () => void;
}

/** One persistent preview and measurement panel, shared by lobby and gameplay. */
export default function PlayerCameraPanel({ tells, presage, setupOpen, onSetup, onStop }: Props) {
  const running = tells.status === "running";
  return <>
    <section aria-label="Your camera" className="rounded-2xl border border-felt-edge bg-background/70 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg"><Camera size={16} className="text-gold" /> Your camera</h2>
        <button type="button" onClick={onSetup} className="text-xs text-gold underline underline-offset-4">{running ? "Camera setup" : "Turn on"}</button>
      </div>
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-felt/30">
        {/* Setup owns the same callback ref while its dialog is open. Only one video may own it. */}
        {!setupOpen && <WebcamFeed videoRef={tells.videoRef} visible={running} className="h-full w-full" />}
        {(!running || setupOpen) && <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-sm text-muted"><CameraOff size={24} /><p>{setupOpen ? "Camera setup is open" : tells.status === "starting" ? "Starting camera…" : "Camera is off"}</p></div>}
        {running && !setupOpen && <span className={`absolute bottom-2 left-2 rounded-full bg-background/85 px-2.5 py-1 text-xs ${tells.frame?.facePresent ? "text-ok" : "text-gold"}`}>{tells.frame?.facePresent ? "Face in view" : "Looking for your face"}</span>}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted">Keep your face and upper chest in view, with light in front of you.</p>
      {running && <button type="button" onClick={onStop} className="mt-3 text-xs text-muted underline underline-offset-4">Turn off camera and measurements</button>}
    </section>
    <PresagePanel presage={presage} cameraOn={running} />
    <section aria-label="Your available signals" className="rounded-2xl border border-felt-edge bg-background/70 p-3">
      <h2 className="text-base">Your play</h2>
      <dl className="mt-3 space-y-2 font-sans text-xs">
        <div className="flex justify-between gap-3"><dt className="text-muted">Decision history</dt><dd>Available during play</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted">Face tracking</dt><dd>{running && tells.frame?.facePresent ? "Available" : "Unavailable"}</dd></div>
        {running && tells.frame?.facePresent && <>
          <div className="flex justify-between gap-3"><dt className="text-muted">Gaze</dt><dd>{tells.frame.gaze}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">Mouth movement</dt><dd>{tells.frame.mouthMoving ? "Observed" : "Not observed"}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">Blink rate</dt><dd>{Math.round(tells.frame.blinkRate)} / min</dd></div>
        </>}
      </dl>
      {tells.decisionFeedback && <p className="mt-3 text-xs leading-relaxed">Your last {tells.decisionFeedback.street} decision took {(tells.decisionFeedback.latencyMs / 1000).toFixed(1)}s.{tells.decisionFeedback.referenceMs ? ` Your recent median on this street is ${(tells.decisionFeedback.referenceMs / 1000).toFixed(1)}s.` : " Your timing reference builds as you play."}</p>}
      <p className="mt-3 text-xs leading-relaxed text-muted">Next call: compare the price with the pot, then consider your opponent’s range. Speed and physical reactions alone don’t establish a bluff.</p>
    </section>
  </>;
}
