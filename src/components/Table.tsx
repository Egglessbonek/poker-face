"use client";

import ActionBar from "@/components/ActionBar";
import { PlayingCard } from "@/components/Card";
import VillainAvatar from "@/components/VillainAvatar";
import type { CursorTracker } from "@/lib/tells/cursor";
import type { ActionType, PublicMatchState, VillainDecision } from "@/lib/types";

interface Props {
  state: PublicMatchState | null;
  decisions: VillainDecision[];
  pending: boolean;
  villainName: string;
  onAct: (type: ActionType, amount?: number) => void;
  onNext: () => void;
  onStart: () => void;
  revealHref?: string;
  cursor?: CursorTracker;
}

export default function Table({ state, decisions, pending, villainName, onAct, onNext, onStart, revealHref, cursor }: Props) {
  const hand = state?.hand ?? null;
  const hero = hand?.players.hero;
  const villain = hand?.players.villain;
  const lastTalk = [...decisions].reverse().find((d) => d.tableTalk)?.tableTalk;
  const lastVillainAction = hand?.actions.filter((a) => a.seat === "villain").at(-1);

  return (
    <section className="flex flex-col gap-4">
      <div className="relative flex min-h-[460px] flex-col items-center justify-between rounded-[48px] border-8 border-felt-edge bg-felt p-6">
        {/* Villain */}
        <div className="flex flex-col items-center gap-2">
          <VillainAvatar speaking={pending} line={lastTalk} name={villainName} />
          <div className="flex gap-2">
            <PlayingCard card={villain?.holeCards[0]} size="sm" />
            <PlayingCard card={villain?.holeCards[1]} size="sm" />
          </div>
          <Stack label={villainName} stack={villain?.stack ?? state?.stacks.villain ?? 0} committed={villain?.committed ?? 0} button={hand?.button === "villain"} />
          {lastVillainAction && !hand?.over && <p className="text-xs uppercase tracking-widest text-gold">{lastVillainAction.type}{lastVillainAction.amount ? ` ${lastVillainAction.amount}` : ""}</p>}
        </div>

        {/* Board + pot */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex gap-2">
            {[0, 1, 2, 3, 4].map((i) => (hand?.board[i] ? <PlayingCard key={i} card={hand.board[i]} /> : <div key={i} className="h-20 w-14 rounded-lg border border-dashed border-felt-edge/60" />))}
          </div>
          <p className="font-mono text-sm text-gold">Pot {hand?.pot ?? 0}</p>
          {hand?.over && (
            <div className="rounded-xl bg-background/80 px-4 py-2 text-center text-sm">
              {hand.winner === "split" ? "Split pot" : hand.winner === "hero" ? "You win the pot" : `${villainName} wins the pot`}
              {hand.showdown && <span className="block text-xs text-muted">{hand.showdown.hero} vs {hand.showdown.villain}</span>}
            </div>
          )}
        </div>

        {/* Hero */}
        <div className="flex flex-col items-center gap-2">
          <Stack label="You" stack={hero?.stack ?? state?.stacks.hero ?? 0} committed={hero?.committed ?? 0} button={hand?.button === "hero"} />
          <div className="flex gap-2">
            <PlayingCard card={hero?.holeCards[0]} size="lg" />
            <PlayingCard card={hero?.holeCards[1]} size="lg" />
          </div>
        </div>

        <p className="absolute left-4 top-4 font-mono text-xs text-muted">Hand {state?.handNumber ?? 0}/{state?.config.handsPerMatch ?? 0} · {hand?.street ?? "—"}</p>
      </div>

      {!state && (
        <button onClick={onStart} className="rounded-xl bg-gold py-3 font-medium text-background">Deal</button>
      )}
      {state && hand && !hand.over && (
        <ActionBar legal={state.legalActions} bounds={state.bounds} pot={hand.pot} disabled={pending || hand.toAct !== "hero"} onAct={onAct} cursor={cursor} />
      )}
      {state && hand?.over && !state.over && (
        <button onClick={onNext} disabled={pending} className="rounded-xl bg-gold py-3 font-medium text-background disabled:opacity-40">Next hand</button>
      )}
      {state?.over && (
        <a href={revealHref} className="rounded-xl bg-gold py-3 text-center font-medium text-background">Match over · See the reveal</a>
      )}
    </section>
  );
}

function Stack({ label, stack, committed, button }: { label: string; stack: number; committed: number; button: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-background/70 px-3 py-1 font-mono text-xs">
      {button && <span className="rounded-full bg-gold px-1.5 text-[10px] font-bold text-background">D</span>}
      <span>{label}</span>
      <span className="text-gold">{stack}</span>
      {committed > 0 && <span className="text-muted">· in {committed}</span>}
    </div>
  );
}
