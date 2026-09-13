"use client";

/**
 * The table header's voice controls: the mute toggle, a "Tap to unmute" state for tabs whose audio the browser
 * has not unlocked yet (a refreshed page). Drop-in for the old inline button:
 * `<VoiceControls voice={voice} />` where `voice` is the `useTalk()` result.
 */

import { Mic2, MicOff } from "lucide-react";
import type { useTalk } from "@/hooks/useTalk";

export default function VoiceControls({ voice }: { voice: ReturnType<typeof useTalk> }) {
  const { muted, unavailable, blocked, speaking, setMuted, unblock } = voice;
  const needsTap = !muted && blocked;
  const label = muted ? "Muted" : needsTap ? "Tap to unmute" : unavailable ? "Voice unavailable" : "Voices on";
  const onClick = () => {
    if (muted) {
      setMuted(false);
      unblock(); // this click is the gesture the browser wants
    } else if (needsTap) unblock();
    else setMuted(true);
  };
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        aria-live="polite"
        className={`flex items-center gap-2 rounded-full border px-4 py-2 text-xs ${needsTap ? "animate-pulse border-gold bg-gold/15 text-gold" : !muted ? "border-gold/50 text-gold" : "border-felt-edge text-muted"}`}
      >
        {!muted ? <Mic2 size={14} className={speaking ? "animate-pulse" : ""} /> : <MicOff size={14} />}
        {label}
      </button>
    </div>
  );
}
