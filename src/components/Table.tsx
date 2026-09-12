"use client";

import ActionBar from "@/components/ActionBar";
import VillainAvatar from "@/components/VillainAvatar";

/** TODO(phase 1): render HandState (board, pots, stacks, hero cards, villain face-down). */
export default function Table({ sessionId }: { sessionId: string | null }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="relative flex min-h-[420px] flex-col items-center justify-between rounded-[48px] border-8 border-felt-edge bg-felt p-6">
        <VillainAvatar speaking={false} />
        <div className="text-muted">Board goes here</div>
        <div className="text-muted">Your cards go here</div>
        <p className="absolute bottom-2 right-4 font-mono text-[10px] text-muted">session {sessionId ?? "…"}</p>
      </div>
      <ActionBar disabled />
    </section>
  );
}
