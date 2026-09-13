"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bot, Crown } from "lucide-react";
import { PlayingCard } from "@/components/Card";
import { prettyCard } from "@/lib/poker/cards";
import type { Card } from "@/lib/types";
import styles from "./PokerTable.module.css";

const TABLE_MUSIC_URL = "/sounds/pokerface.wav";
const TABLE_MUSIC_VOLUME = 0.3;

/** View data only: adapters must supply cards and details that this viewer is allowed to see. */
export interface PokerSeatView {
  id: string; seat: number; name: string; kind: "human" | "ai"; stack: number; committed: number;
  cards: Card[]; inHand: boolean; folded: boolean; allIn: boolean;
  isMe?: boolean; connected?: boolean; button?: boolean; blind?: "SB" | "BB";
  status?: string; speaking?: boolean; detail?: ReactNode;
  talk?: { text: string; expiresAt?: number };
}

interface Props {
  players: PokerSeatView[]; seatCount: number; anchor?: number; board: Card[];
  pots: Array<{ amount: number }>; handNumber: number; handsPerMatch: number; street: string;
  currentPlayerId: string | null; turnDeadline?: number; turnStartedAt?: number;
  secondsRemaining?: number | null; outcome?: ReactNode;
}

export default function PokerTable({ players, seatCount, anchor = 0, board, pots, handNumber, handsPerMatch, street, currentPlayerId, turnDeadline, turnStartedAt, secondsRemaining, outcome }: Props) {
  const stage = useRef<HTMLDivElement>(null);
  const [space, setSpace] = useState({ width: 1000, height: 600 });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const music = new Audio(TABLE_MUSIC_URL);
    music.loop = true;
    music.preload = "auto";
    music.volume = TABLE_MUSIC_VOLUME;
    let active = true;
    let playPending = false;

    const stopRetrying = () => {
      document.removeEventListener("pointerdown", play);
      document.removeEventListener("keydown", play);
    };
    const play = () => {
      if (!active || playPending || !music.paused) return;
      playPending = true;
      void music.play()
        .then(stopRetrying)
        .catch(() => {})
        .finally(() => { playPending = false; });
    };

    // Autoplay may be blocked on a direct visit. Keep the first interaction as a fallback.
    document.addEventListener("pointerdown", play);
    document.addEventListener("keydown", play);
    play();

    return () => {
      active = false;
      stopRetrying();
      music.pause();
      music.currentTime = 0;
    };
  }, []);
  useEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(([entry]) => setSpace({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  const ticking = !!turnDeadline || players.some((p) => !!p.talk?.expiresAt);
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [ticking]);

  const compact = space.width < 640;
  // Adapt the aspect ratio to the available space, then scale only when seats would stop fitting.
  const width = compact ? 500 : Math.max(900, space.width);
  const height = Math.max(compact ? 640 : 450, space.height * width / Math.max(1, space.width));
  const scale = Math.max(0, Math.min(space.width / width, space.height / height));
  const active = players.find((p) => p.id === currentPlayerId);
  const seconds = turnDeadline ? Math.max(0, Math.ceil((turnDeadline - now) / 1000)) : secondsRemaining ?? null;
  const duration = turnDeadline && turnStartedAt !== undefined ? turnDeadline - turnStartedAt : 0;
  const fraction = duration > 0 ? Math.max(0, Math.min(1, (turnDeadline! - now) / duration)) : null;

  return (
    <div ref={stage} className={styles.stage} aria-label="Poker table" data-poker-table>
      <div className={styles.canvas} data-table-canvas data-compact={compact} style={{ width, height, transform: `translate(-50%, -50%) scale(${scale})` }}>
        <div className={styles.surface} data-table-surface><div className={styles.cushion}><div className={styles.felt} /></div></div>
        <div className={styles.meta}><span>Hand {handNumber}{handsPerMatch ? ` / ${handsPerMatch}` : ""}</span><span>{street}</span></div>
        <div className={styles.center}>
          <div className={styles.board} aria-label="Community cards">
            {Array.from({ length: 5 }, (_, i) => board[i] ? <div key={i} role="img" aria-label={`Community card ${i + 1}: ${prettyCard(board[i])}`}><PlayingCard card={board[i]} size={compact ? "sm" : "md"} /></div> : <div key={i} className={styles.cardSlot} aria-hidden="true" />)}
          </div>
          <div className={styles.pots}>{pots.map((pot, i) => <div key={i} className={styles.pot}><span className={styles.chips} aria-hidden="true" /><span><small>{i ? `Side pot ${i}` : "Pot"}</small><strong>{pot.amount}</strong></span></div>)}</div>
          <div className={styles.turnStatus}>{outcome ?? (active ? <><span className={styles.liveDot} />{active.isMe ? "Your turn" : `${active.name} ${active.kind === "ai" ? "is thinking" : "to act"}`}</> : "Next hand in a moment…")}</div>
        </div>
        {Array.from({ length: seatCount }, (_, index) => {
          const player = players.find((p) => p.seat === index);
          const isActive = !!player && player.id === currentPlayerId;
          const talk = player?.talk && (!player.talk.expiresAt || player.talk.expiresAt > now) ? player.talk.text : null;
          return <div key={index}>
            {player && player.committed > 0 && <div className={styles.committed} style={position(index, seatCount, anchor, 27, 25)}><span className={styles.miniChip} />{player.committed}</div>}
            <div className={styles.seatPosition} style={position(index, seatCount, anchor, compact ? 36 : 40, 36)}>
              {talk && <div className={styles.bubble} title={talk}><p>“{talk}”</p></div>}
              {player ? <div className={styles.seat} data-player-kind={player.kind} data-active={isActive} data-muted={player.folded || !player.inHand} data-speaking={player.speaking} data-me={player.isMe}>
                {isActive && fraction !== null && <div aria-hidden="true" className={styles.timerRing} style={{ background: `conic-gradient(var(--gold) ${fraction * 360}deg, #d4af3720 0deg)` }} />}
                {isActive && <span role="timer" aria-label={`${player.name}'s turn${seconds === null ? ', no time limit' : ''}`} className={styles.timer}>{seconds === null ? "∞" : `${seconds}s`}</span>}
                {player.blind && <span className={styles.blind} title={player.blind === "SB" ? "Small blind" : "Big blind"} aria-label={`${player.name}: ${player.blind === "SB" ? "Small blind" : "Big blind"}`}>{player.blind}</span>}
                <div className={styles.identity}>
                  <span className={styles.avatar} data-ai={player.kind === "ai"}>{player.kind === "ai" ? <Bot size={14} aria-label="AI player" /> : player.name[0]}</span>
                  <div className={styles.nameAndStack}><p title={player.name}>{player.name}{player.button && <Crown size={10} aria-label="Dealer button" />}</p><span>{player.stack}{player.allIn && <em> all in</em>}</span></div>
                  {player.connected === false && <span className={styles.disconnected} title="Disconnected" />}
                </div>
                <div className={styles.handRow}>
                  <div className={styles.holeCards}>{player.inHand ? [0, 1].map((i) => <div key={i} role="img" aria-label={player.cards[i] ? prettyCard(player.cards[i]) : `Hidden hole card ${i + 1}`}><PlayingCard card={player.cards[i]} size="sm" /></div>) : <span>Waiting</span>}</div>
                  <span className={styles.action}>{player.folded ? "folded" : player.status ?? (isActive && player.kind === "ai" ? "thinking…" : player.isMe ? "you" : player.kind)}</span>
                </div>
                {player.detail && <div className={styles.detail}>{player.detail}</div>}
              </div> : <div className={styles.empty}>Open seat</div>}
            </div>
          </div>;
        })}
      </div>
    </div>
  );
}

function position(seat: number, count: number, anchor: number, rx: number, ry: number) {
  const angle = Math.PI / 2 + Math.PI * 2 * ((seat - anchor + count) % count) / count;
  return { left: `${50 + Math.cos(angle) * rx}%`, top: `${50 + Math.sin(angle) * ry}%` };
}
