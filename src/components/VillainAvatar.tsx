"use client";

/** TODO(phase 5): animate on ElevenLabs isSpeaking, show last table talk as a speech bubble. */
export default function VillainAvatar({ speaking, line }: { speaking: boolean; line?: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`h-20 w-20 rounded-full border-4 ${speaking ? "border-gold" : "border-felt-edge"} bg-background`} />
      {line && <p className="max-w-xs rounded-lg bg-background/80 px-3 py-1 text-center text-sm">{line}</p>}
    </div>
  );
}
