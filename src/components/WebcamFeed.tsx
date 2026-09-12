"use client";

/**
 * Hidden <video> fed by getUserMedia; runs the FaceLandmarker loop and emits TellFrames.
 * TODO(phase 2): getFaceLandmarker() + startDetectionLoop() + extractFrame(), throttle emit to 4Hz.
 */
import { useEffect, useRef } from "react";
import type { TellFrame } from "@/lib/types";

export default function WebcamFeed({ onFrame, preview = false }: { onFrame?: (f: TellFrame) => void; preview?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  void onFrame;

  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 480, facingMode: "user" }, audio: false })
      .then((s) => {
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(console.error);
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  return <video ref={videoRef} autoPlay playsInline muted className={preview ? "w-40 rounded-lg" : "hidden"} />;
}
