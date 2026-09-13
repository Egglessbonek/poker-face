"use client";

/**
 * Live table connection. One EventSource per (code, token); with a token the stream is the player's
 * view, without it the rail view. Exposes state, per-player tells, AI reads, the talk queue, and the
 * actions a seated player can take.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client/identity";
import { bounds as calcBounds, legalActions as calcLegal } from "@/lib/poker/engine";
import type { Action, ActionType, BaselineStats, Player, PlayerTells, TableConfig, TableEvent, TableState, TellFrame, TellVector, VillainDecision } from "@/lib/types";

export type StreamStatus = "connecting" | "live" | "ended" | "error";

export interface TalkEvent {
  id: number;
  playerId: string;
  text: string;
  voiceId?: string;
  handNumber: number;
  at: number;
}

export interface AIRead {
  decision: VillainDecision;
  handNumber: number;
  street: string;
  at: number;
}

/** One action as it happened, for tickers and histories. */
export interface ActionEvent {
  id: number;
  playerId: string;
  action: Action;
  handNumber: number;
}

/** Identity at the table a rematch opened. */
export interface RematchResult {
  code: string;
  playerId: string;
  token: string;
}

export interface HandRecord {
  handNumber: number;
  board: string[];
  results: NonNullable<TableState["hand"]>["results"];
  foldedOut?: boolean;
  seats: NonNullable<TableState["hand"]>["seats"];
}

export function useTable(code: string, token: string | null, playerId: string | null) {
  const [state, setState] = useState<TableState | null>(null);
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [tells, setTells] = useState<Record<string, PlayerTells>>({});
  const [reads, setReads] = useState<Record<string, AIRead>>({});
  const [talk, setTalk] = useState<TalkEvent[]>([]);
  const [lastActions, setLastActions] = useState<Record<string, Action>>({});
  const [history, setHistory] = useState<HandRecord[]>([]);
  const [actions, setActions] = useState<ActionEvent[]>([]);
  const [rematchCode, setRematchCode] = useState<string | null>(null);
  const talkId = useRef(0);
  const actionId = useRef(0);
  const handRef = useRef<number>(0);
  const streetRef = useRef<string>("");

  useEffect(() => {
    if (!code) return;
    const url = `/api/table/${code}/stream${token ? `?token=${encodeURIComponent(token)}` : ""}`;
    const es = new EventSource(url);
    es.onopen = () => setStatus("live");
    es.onmessage = (m) => {
      const ev = JSON.parse(m.data) as TableEvent;
      switch (ev.type) {
        case "state": {
          const h = ev.state.hand;
          // New hand or new street: clear the per-seat action badges.
          if (h && (h.handNumber !== handRef.current || h.street !== streetRef.current)) {
            handRef.current = h.handNumber;
            streetRef.current = h.street;
            setLastActions({});
          }
          setState(ev.state);
          break;
        }
        case "action":
          setLastActions((prev) => ({ ...prev, [ev.playerId]: ev.action }));
          setActions((prev) => [...prev.slice(-199), { id: ++actionId.current, playerId: ev.playerId, action: ev.action, handNumber: handRef.current }]);
          break;
        case "tells":
          setTells((prev) => ({ ...prev, [ev.playerId]: ev.tells }));
          break;
        case "ai_decision":
          setReads((prev) => ({ ...prev, [ev.playerId]: { decision: ev.decision, handNumber: ev.handNumber, street: ev.street, at: Date.now() } }));
          break;
        case "talk":
          setTalk((prev) => [...prev.slice(-20), { id: ++talkId.current, playerId: ev.playerId, text: ev.text, voiceId: ev.voiceId, handNumber: handRef.current, at: Date.now() }]);
          break;
        case "hand_end":
          setHistory((prev) => [...prev.slice(-50), { handNumber: ev.hand.handNumber, board: ev.hand.board, results: ev.hand.results, foldedOut: ev.hand.foldedOut, seats: ev.hand.seats }]);
          break;
        case "rematch":
          setRematchCode(ev.code);
          break;
        case "ended":
          setStatus("ended");
          es.close();
          break;
      }
    };
    es.onerror = () => setStatus((s) => (s === "ended" ? s : "error"));
    return () => es.close();
  }, [code, token]);

  const me: Player | null = useMemo(() => state?.players.find((p) => p.id === playerId) ?? null, [state, playerId]);
  const hand = state?.hand ?? null;
  const cfg = state?.config;
  const myTurn = !!(me && hand && !hand.over && hand.toAct === me.seat);
  const legal: ActionType[] = useMemo(() => (me && hand && cfg ? calcLegal(hand, me.seat, cfg) : []), [me, hand, cfg]);
  const bounds = useMemo(() => (me && hand && cfg && myTurn ? calcBounds(hand, me.seat, cfg) : null), [me, hand, cfg, myTurn]);

  const call = useCallback(
    async <T = { ok: true }>(path: string, method: string, body?: Record<string, unknown>): Promise<T> => {
      setError(null);
      try {
        return await api<T>(`/api/table/${code}${path}`, method, { token, ...body });
      } catch (e) {
        setError((e as Error).message);
        throw e;
      }
    },
    [code, token],
  );

  /** Resolves true when the server accepted the action; false when it rejected it (see `error`). */
  const act = useCallback((type: ActionType, amount?: number, latencyMs?: number, tellVector?: TellVector | null) => call("/act", "POST", { type, amount, latencyMs, tells: tellVector ?? null }).then(() => true, () => false), [call]);
  const start = useCallback(() => call("/start", "POST").catch(() => {}), [call]);
  const addAI = useCallback((modelId: string) => call("/ai", "POST", { modelId }).catch(() => {}), [call]);
  const removePlayer = useCallback((id: string) => call("/ai", "DELETE", { playerId: id }).catch(() => {}), [call]);
  const updateConfig = useCallback((config: Partial<TableConfig>) => call("/config", "PATCH", { config }), [call]);
  const updateVisibility = useCallback((isPublic: boolean) => call("/visibility", "PATCH", { isPublic }), [call]);
  const leave = useCallback(() => call("/leave", "POST").catch(() => {}), [call]);
  const end = useCallback(() => call("/end", "POST").catch(() => {}), [call]);
  /** Host only, once finished: open a new table with the same config and AI seats. Null when the request failed (see `error`). */
  const rematch = useCallback(() => call<RematchResult>("/rematch", "POST").catch((): null => null), [call]);
  const sendTells = useCallback(
    (payload: { frame?: TellFrame | null; vector?: TellVector | null; after?: TellVector | null; live?: TellVector | null; baseline?: BaselineStats }) =>
      fetch(`/api/table/${code}/tells`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, ...payload }), keepalive: true }).catch(() => {}),
    [code, token],
  );

  return { state, status, error, tells, reads, talk, lastActions, actions, history, rematchCode, me, hand, myTurn, legal, bounds, act, start, addAI, removePlayer, updateConfig, updateVisibility, leave, end, rematch, sendTells };
}
