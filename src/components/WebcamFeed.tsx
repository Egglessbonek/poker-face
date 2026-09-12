"use client";

import type { Ref } from "react";
import { cn } from "@/lib/utils";

/** The <video> element the tell pipeline reads from. Mirrored preview when visible. */
export default function WebcamFeed({ videoRef, visible = true, className }: { videoRef: Ref<HTMLVideoElement>; visible?: boolean; className?: string }) {
  return <video ref={videoRef} autoPlay playsInline muted className={cn("-scale-x-100 rounded-xl bg-background object-cover", visible ? "" : "hidden", className)} />;
}
