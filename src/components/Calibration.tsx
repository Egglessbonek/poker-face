"use client";

import type { Ref } from "react";
import WebcamFeed from "@/components/WebcamFeed";
import type { CameraStatus } from "@/hooks/useTells";

interface Props {
  videoRef: Ref<HTMLVideoElement>;
  status: CameraStatus;
  progress: number | null; // null = not calibrating
  facePresent: boolean;
  onStartCamera: () => void;
  onCalibrate: () => void;
  onSkip: () => void;
  /** Why the last attempt did not produce a baseline. */
  message?: string | null;
}

export default function Calibration({ videoRef, status, progress, facePresent, onStartCamera, onCalibrate, onSkip, message }: Props) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-5 rounded-3xl border border-felt-edge p-6 text-center">
      <p className="text-xs uppercase tracking-[0.3em] text-gold">Before you sit down</p>
      <h2 className="text-2xl font-semibold">Let the table get a read on you</h2>
      <p className="text-sm text-muted">We take a 10-second baseline of your resting face. Every tell is measured against it.</p>
      <div className="relative">
        <WebcamFeed videoRef={videoRef} className="aspect-[4/3] w-80" />
        {status === "running" && (
          <span className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${facePresent ? "bg-ok/80" : "bg-danger/80"}`}>
            {facePresent ? "face locked" : "no face"}
          </span>
        )}
        {progress !== null && (
          <div className="absolute inset-x-0 bottom-0 h-2 overflow-hidden rounded-b-xl bg-background/60">
            <div className="h-full bg-gold transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
      </div>
      {status === "idle" && <button onClick={onStartCamera} className="rounded-full bg-gold px-6 py-2 font-medium text-background">Turn on camera</button>}
      {status === "starting" && <p className="text-sm text-muted">Loading face model…</p>}
      {status === "denied" && <p className="text-sm text-danger">Camera blocked. Allow access in the browser bar, then reload.</p>}
      {status === "error" && <p className="text-sm text-danger">Camera failed to start. Check the console.</p>}
      {status === "running" && progress === null && (
        <button onClick={onCalibrate} disabled={!facePresent} className="rounded-full bg-gold px-6 py-2 font-medium text-background disabled:opacity-40">
          Relax and start baseline
        </button>
      )}
      {progress !== null && <p className="text-sm text-muted">Hold still, breathe normally… {Math.round(progress * 10)}s</p>}
      {message && progress === null && <p className="text-sm text-danger">{message}</p>}
      <button onClick={onSkip} className="text-xs text-muted underline">Skip (no tells)</button>
    </div>
  );
}
