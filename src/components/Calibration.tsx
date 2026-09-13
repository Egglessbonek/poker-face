"use client";

import { CameraOff } from "lucide-react";
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
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-5 rounded-3xl border border-felt-edge bg-background p-6 text-center">
      <h2 className="text-2xl">Camera setup</h2>
      <div className="relative aspect-[4/3] w-full max-w-80 overflow-hidden rounded-xl bg-felt/30">
        <WebcamFeed videoRef={videoRef} className="h-full w-full rounded-none" />
        {status !== "running" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-felt/70 to-background text-muted" aria-label="Camera preview unavailable">
            <CameraOff size={40} strokeWidth={1.5} aria-hidden="true" />
            <span className="text-xs">{status === "starting" ? "Starting camera…" : "Camera is off"}</span>
          </div>
        )}
        {status === "running" && (
          <span className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] ${facePresent ? "bg-ok/80" : "bg-danger/80"}`}>
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
      {status === "denied" && <div><p className="text-sm text-danger">Camera blocked. Allow access in the browser bar, then try again.</p><button onClick={onStartCamera} className="mt-3 rounded-full border border-felt-edge px-5 py-2 text-sm">Try again</button></div>}
      {status === "error" && <div><p className="text-sm text-danger">Camera failed to start. Check the device and try again.</p><button onClick={onStartCamera} className="mt-3 rounded-full border border-felt-edge px-5 py-2 text-sm">Try again</button></div>}
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
