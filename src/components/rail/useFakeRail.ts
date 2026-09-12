"use client";

import { useEffect, useState } from "react";
import { FAKE_HISTORY, tableForCode } from "./fixtures";
import type { RailHistoryEntry, RailTableSnapshot, RailViewModel } from "./model";

const DEMO_STATE_BY_CODE = {
  "4040": "not-found",
  "9999": "ended",
  "1111": "disconnected",
} as const;

const PLAYER_NAMES: Record<string, string> = {
  maya: "Maya",
  vega: "Vega",
  theo: "Theo",
  dutch: "Dutch",
};

const LIVE_ACTIONS = [
  { playerId: "vega", message: "Vega raises to 84", action: "Raise 84", tone: "action" as const },
  { playerId: "dutch", message: "Dutch folds", action: "Fold", tone: "action" as const },
  { playerId: "maya", message: "Maya calls 52", action: "Call 52", tone: "action" as const },
  { playerId: "vega", message: "River dealt: 2♣", action: "Waiting", tone: "deal" as const },
];

export function useFakeRail(code: string): RailViewModel {
  const [connection, setConnection] = useState<RailViewModel["connection"]>("connecting");
  const [table, setTable] = useState<RailTableSnapshot>(() => tableForCode(code));
  const [history, setHistory] = useState<RailHistoryEntry[]>(FAKE_HISTORY);

  useEffect(() => {
    const terminalState = DEMO_STATE_BY_CODE[code as keyof typeof DEMO_STATE_BY_CODE];
    const connectTimer = window.setTimeout(() => setConnection(terminalState ?? "live"), 650);
    if (terminalState) return () => window.clearTimeout(connectTimer);

    let step = 0;
    const updateTimer = window.setInterval(() => {
      const update = LIVE_ACTIONS[step % LIVE_ACTIONS.length];
      const next = LIVE_ACTIONS[(step + 1) % LIVE_ACTIONS.length];
      const isRiver = update.tone === "deal";

      setTable((current) => ({
        ...current,
        street: isRiver ? "river" : current.street,
        board: isRiver && current.board.length === 4 ? [...current.board, { rank: "2", suit: "clubs" }] : current.board,
        currentPlayerId: isRiver ? "maya" : next.playerId,
        turnSecondsRemaining: 15,
        pots: current.pots.map((pot, index) => (index === 0 && !isRiver ? { ...pot, amount: pot.amount + 8 } : pot)),
        players: current.players.map((player) => {
          const tell = player.tell
            ? {
                ...player.tell,
                arousal: Math.max(8, Math.min(94, player.tell.arousal + (step % 2 === 0 ? 3 : -2))),
                bluffLikelihood: Math.max(5, Math.min(95, player.tell.bluffLikelihood + (step % 3 === 0 ? 2 : -1))),
              }
            : undefined;
          return { ...player, lastAction: player.id === update.playerId ? update.action : player.lastAction, tell };
        }),
      }));
      setHistory((current) => [
        ...current.slice(-11),
        {
          id: `live-${step}`,
          handNumber: 6,
          street: isRiver ? "river" : "turn",
          playerName: isRiver ? undefined : PLAYER_NAMES[update.playerId],
          message: update.message,
          tone: update.tone,
        },
      ]);
      step += 1;
    }, 4_500);

    const countdownTimer = window.setInterval(() => {
      setTable((current) => ({
        ...current,
        turnSecondsRemaining: current.turnSecondsRemaining === null ? null : Math.max(0, current.turnSecondsRemaining - 1),
      }));
    }, 1_000);

    return () => {
      window.clearTimeout(connectTimer);
      window.clearInterval(updateTimer);
      window.clearInterval(countdownTimer);
    };
  }, [code]);

  return { connection, table, history };
}
