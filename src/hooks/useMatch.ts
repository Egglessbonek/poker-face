"use client";

import { useCallback, useRef, useState } from "react";
import type { ActionType, PublicMatchState, TellVector, VillainDecision } from "@/lib/types";

interface StepResult {
  state: PublicMatchState;
  villainDecisions: VillainDecision[];
}

export function useMatch(sessionId: string | null) {
  const [state, setState] = useState<PublicMatchState | null>(null);
  const [lastDecisions, setLastDecisions] = useState<VillainDecision[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** When the hero was prompted to act; used for decision-latency tells. */
  const promptedAt = useRef<number>(0);

  const apply = useCallback((r: StepResult) => {
    setState(r.state);
    setLastDecisions(r.villainDecisions);
    if (r.state.hand && r.state.hand.toAct === "hero" && !r.state.hand.over) promptedAt.current = performance.now();
  }, []);

  const post = useCallback(
    async (path: string, body: Record<string, unknown>) => {
      if (!sessionId) return;
      setPending(true);
      setError(null);
      try {
        const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, ...body }) });
        const data = (await res.json()) as StepResult & { error?: string };
        if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
        apply(data);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setPending(false);
      }
    },
    [sessionId, apply],
  );

  const start = useCallback(() => post("/api/game/start", {}), [post]);
  const next = useCallback(() => post("/api/game/next", {}), [post]);
  const act = useCallback(
    (type: ActionType, amount?: number, tells?: TellVector | null) => {
      const latencyMs = promptedAt.current ? Math.round(performance.now() - promptedAt.current) : undefined;
      return post("/api/game/act", { type, amount, latencyMs, tells: tells ?? null });
    },
    [post],
  );

  return { state, lastDecisions, pending, error, start, next, act, promptedAt };
}
