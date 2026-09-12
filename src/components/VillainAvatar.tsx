"use client";

/** TODO(phase 5): animate on ElevenLabs isSpeaking. */
export default function VillainAvatar({ speaking, line, name }: { speaking: boolean; line?: string; name?: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`flex h-16 w-16 items-center justify-center rounded-full border-4 bg-background text-xl font-semibold ${speaking ? "border-gold" : "border-felt-edge"}`}>
        {name?.[0] ?? "?"}
      </div>
      {line && <p className="max-w-xs rounded-lg bg-background/80 px-3 py-1 text-center text-sm">“{line}”</p>}
    </div>
  );
}
