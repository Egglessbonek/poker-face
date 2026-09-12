"use client";

import { useEffect, useRef, useState } from "react";
import type { Action, Card, HandState, RailEvent, Suit, TellFrame, TellVector, VillainDecision } from "@/lib/types";
import type { RailCard, RailHistoryEntry, RailPlayerView, RailTableSnapshot, RailTell, RailViewModel } from "./model";

const SUITS: Record<Suit, RailCard["suit"]> = {
  s: "spades",
  h: "hearts",
  d: "diamonds",
  c: "clubs",
};

function toRailCard(card: Card): RailCard {
  const suit = card.slice(-1) as keyof typeof SUITS;
  return { rank: card.slice(0, -1), suit: SUITS[suit] };
}

function dominantEmotion(frame: TellFrame): string {
  let result = "neutral";
  let highest = -1;
  for (const [emotion, score] of Object.entries(frame.emotion)) {
    if (score > highest) {
      result = emotion;
      highest = score;
    }
  }
  return result;
}

function toRailTell(frame: TellFrame, vector?: TellVector, previous?: RailTell): RailTell {
  const bluffLikelihood = vector ? vector.bluffLikelihood * 100 : previous?.bluffLikelihood ?? 50;
  return {
    arousal: vector?.arousal ?? previous?.arousal ?? Math.round(frame.tension * 100),
    bluffLikelihood: Math.round(bluffLikelihood),
    confidence: Math.round((vector?.confidence ?? frame.confidence) * 100),
    trend: vector?.trend ?? previous?.trend ?? "stable",
    evidence: vector?.evidence.map((item) => item.text) ?? previous?.evidence ?? [],
    emotion: dominantEmotion(frame),
  };
}

function actionText(action: Action): string {
  const label = action.type === "allin" ? "All-in" : action.type.charAt(0).toUpperCase() + action.type.slice(1);
  return action.amount === undefined ? label : `${label} ${action.amount}`;
}

function handToSnapshot(code: string, hand: Omit<HandState, "deck">, previous: RailTableSnapshot | null, personaId: string): RailTableSnapshot {
  const previousPlayers = new Map(previous?.players.map((player) => [player.id, player]));
  const seats = ["hero", "villain"] as const;
  const players: RailPlayerView[] = seats.map((seat, index) => {
    const player = hand.players[seat];
    const old = previousPlayers.get(seat);
    const lastAction = [...hand.actions].reverse().find((action) => action.seat === seat);
    const cardsVisible = player.holeCards.length > 0 && (seat === "hero" || hand.street === "showdown");
    return {
      id: seat,
      name: seat === "hero" ? "Hero" : personaId.charAt(0).toUpperCase() + personaId.slice(1),
      kind: seat === "hero" ? "human" : "ai",
      persona: seat === "villain" ? personaId : undefined,
      seatIndex: index * 3,
      stack: player.stack,
      committed: player.committed,
      cards: cardsVisible ? player.holeCards.map(toRailCard) : [],
      cardsVisible,
      folded: player.folded,
      allIn: player.allIn,
      position: hand.button === seat ? "BTN · SB" : "BB",
      isButton: hand.button === seat,
      isSmallBlind: hand.button === seat,
      isBigBlind: hand.button !== seat,
      lastAction: lastAction ? actionText(lastAction) : old?.lastAction,
      talk: old?.talk,
      tell: old?.tell,
      aiRead: old?.aiRead,
    };
  });

  return {
    code,
    phase: "playing",
    handNumber: hand.handNumber,
    handsPerMatch: previous?.handsPerMatch ?? 10,
    street: hand.street,
    board: hand.board.map(toRailCard),
    pots: [{ id: "main", label: "Main pot", amount: hand.pot, eligiblePlayerIds: players.filter((player) => !player.folded).map((player) => player.id) }],
    currentPlayerId: hand.toAct,
    turnSecondsRemaining: null,
    spectators: previous?.spectators ?? 1,
    tellVisibility: "rail",
    players,
  };
}

function applyTell(table: RailTableSnapshot | null, frame: TellFrame, vector?: TellVector): RailTableSnapshot | null {
  if (!table) return table;
  return {
    ...table,
    players: table.players.map((player) => player.id === "hero" ? { ...player, tell: toRailTell(frame, vector, player.tell) } : player),
  };
}

function applyDecision(table: RailTableSnapshot | null, decision: VillainDecision): RailTableSnapshot | null {
  if (!table) return table;
  return {
    ...table,
    players: table.players.map((player) => player.id === "villain" ? {
      ...player,
      lastAction: decision.action === "allin" ? "All-in" : decision.action.charAt(0).toUpperCase() + decision.action.slice(1),
      talk: decision.tableTalk,
      aiRead: {
        mathAction: decision.mathAction,
        finalAction: decision.action,
        target: "Hero",
        reasoning: decision.reasoning,
        tellsUsed: decision.tellsUsed,
      },
    } : player),
  };
}

export function useLiveRail(code: string): RailViewModel {
  const [connection, setConnection] = useState<RailViewModel["connection"]>("connecting");
  const [table, setTable] = useState<RailTableSnapshot | null>(null);
  const [history, setHistory] = useState<RailHistoryEntry[]>([]);
  const personaId = useRef("villain");
  const sequence = useRef(0);
  const latestTable = useRef<RailTableSnapshot | null>(null);

  useEffect(() => {
    const source = new EventSource(`/api/rail/${code}`);
    const appendHistory = (entry: Omit<RailHistoryEntry, "id">) => {
      sequence.current += 1;
      setHistory((current) => [...current.slice(-99), { ...entry, id: `live-${sequence.current}` }]);
    };
    const updateTable = (updater: (current: RailTableSnapshot | null) => RailTableSnapshot | null) => {
      setTable((current) => {
        const next = updater(current);
        latestTable.current = next;
        return next;
      });
    };

    source.onmessage = (message) => {
      let event: RailEvent;
      try {
        event = JSON.parse(message.data) as RailEvent;
      } catch {
        return;
      }
      switch (event.type) {
        case "hello":
          personaId.current = event.personaId;
          break;
        case "hand":
          updateTable((current) => handToSnapshot(code, event.hand, current, personaId.current));
          setConnection("live");
          break;
        case "tells":
          updateTable((current) => applyTell(current, event.frame, event.vector));
          break;
        case "hero_action":
          appendHistory({ handNumber: latestTable.current?.handNumber ?? 0, street: event.action.street, playerName: "Hero", message: `Hero ${actionText(event.action).toLowerCase()}`, tone: "action" });
          break;
        case "villain":
          updateTable((current) => applyDecision(current, event.decision));
          appendHistory({ handNumber: latestTable.current?.handNumber ?? 0, street: latestTable.current?.street ?? "preflop", playerName: personaId.current, message: `${personaId.current} ${event.decision.action}`, tone: "action" });
          break;
        case "transcript":
          appendHistory({ handNumber: latestTable.current?.handNumber ?? 0, street: latestTable.current?.street ?? "preflop", playerName: event.role, message: event.text, tone: "talk" });
          break;
        case "ended":
          source.close();
          setConnection("ended");
          break;
      }
    };
    source.onerror = () => setConnection("disconnected");
    return () => source.close();
  }, [code]);

  return { connection, table, history };
}
