"use client";

/** 10-second "relax and look at the camera" screen. TODO(phase 2): collect frames, computeBaseline(), progress ring. */
export default function Calibration({ onDone }: { onDone: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-lg">Look at the camera and relax for 10 seconds.</p>
      <button onClick={onDone} className="rounded-full bg-gold px-6 py-2 text-background">Skip (dev)</button>
    </div>
  );
}
