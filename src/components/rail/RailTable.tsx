import { Bot, Crown } from "lucide-react";
import { PlayingCard } from "@/components/Card";
import type { Card, Suit } from "@/lib/types";
import type { RailCard, RailPlayerView, RailTableSnapshot } from "./model";

const SUIT_CODE: Record<RailCard["suit"], Suit> = {
  spades: "s",
  hearts: "h",
  diamonds: "d",
  clubs: "c",
};

function cardCode(card: RailCard): Card {
  return `${card.rank}${SUIT_CODE[card.suit]}` as Card;
}

function cardLabel(card: RailCard): string {
  const rank = { A: "Ace", K: "King", Q: "Queen", J: "Jack", T: "Ten" }[card.rank] ?? card.rank;
  return `${rank} of ${card.suit}`;
}

function PlayerCards({ player }: { player: RailPlayerView }) {
  if (player.cardsVisible) {
    return (
      <div className="flex gap-1">
        {player.cards.map((card, index) => (
          <div key={`${player.id}-${index}`} role="img" aria-label={cardLabel(card)}>
            <div aria-hidden="true"><PlayingCard card={cardCode(card)} size="sm" /></div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="flex gap-1">
      {[0, 1].map((index) => (
        <div key={index} role="img" aria-label={`Hidden hole card ${index + 1}`}>
          <div aria-hidden="true"><PlayingCard size="sm" /></div>
        </div>
      ))}
    </div>
  );
}

function PlayerSeat({ player, active }: { player: RailPlayerView; active: boolean }) {
  return (
    <div className={`relative rounded-2xl border bg-background/95 p-2 shadow-xl transition ${active ? "border-gold shadow-[0_0_28px_rgba(212,175,55,0.3)]" : "border-felt-edge"} ${player.folded ? "opacity-55" : ""}`}>
      <div className="flex items-center gap-2">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${player.kind === "ai" ? "bg-chip-blue/70" : "bg-felt-edge"}`}>
          {player.kind === "ai" ? <Bot size={14} aria-label="AI player" /> : player.name[0]}
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 truncate text-xs font-medium text-foreground">
            {player.name}{player.isButton && <Crown size={10} className="shrink-0 text-gold" aria-label="Dealer" />}
          </p>
          <p className="font-mono text-[10px] text-gold">
            {player.stack}{player.allIn ? <span className="ml-1 uppercase text-danger">all in</span> : null}
          </p>
        </div>
      </div>

      <div className="mt-2 flex items-end justify-between gap-2">
        <PlayerCards player={player} />
        <p className="min-w-0 truncate text-right text-[9px] uppercase tracking-wide text-muted">
          {player.lastAction ?? player.position}
        </p>
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-2 border-t border-felt-edge pt-1.5">
        <p className="min-w-0 truncate text-left text-xs font-semibold text-foreground" title={player.bestHand}>
          {!player.inHand ? "Not in hand" : player.bestHand ?? "Calculating…"}
        </p>
        <p className="shrink-0 font-mono text-xs text-gold">
          {player.inHand && player.equity !== undefined ? `${player.equity}%` : "—"}
        </p>
      </div>
    </div>
  );
}

function PotDisplay({ table }: { table: RailTableSnapshot }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {table.pots.map((pot, index) => (
        <div key={pot.id} className="rounded-full border border-gold/30 bg-background/75 px-4 py-1.5 text-center shadow">
          <span className="text-[9px] uppercase tracking-wider text-muted">{index ? `Side ${index}` : "Pot"}</span>
          <span className="ml-1 font-mono text-sm text-gold">{pot.amount}</span>
        </div>
      ))}
    </div>
  );
}

export default function RailTable({ table }: { table: RailTableSnapshot }) {
  return (
    <section aria-label="Poker table" className="overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="relative mx-auto aspect-[16/10] min-w-[700px] max-w-[min(1000px,calc((100dvh-10rem)*1.6))]">
        <div className="absolute inset-[9%_7%] rounded-[50%] border-[10px] border-[#174c3b] bg-felt shadow-[inset_0_0_80px_rgba(0,0,0,0.35),0_24px_80px_rgba(0,0,0,0.35)]">
          <div className="absolute inset-3 rounded-[50%] border border-gold/15" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="flex h-20 items-center gap-2">
              {Array.from({ length: 5 }, (_, index) => table.board[index]
                ? (
                  <div key={index} role="img" aria-label={`Community card ${index + 1}: ${cardLabel(table.board[index])}`}>
                    <div aria-hidden="true"><PlayingCard card={cardCode(table.board[index])} /></div>
                  </div>
                )
                : <div key={index} aria-hidden="true" className="h-20 w-14 rounded-lg border border-dashed border-white/15" />)}
            </div>
            <PotDisplay table={table} />
          </div>
        </div>

        {Array.from({ length: table.seatCount }, (_, seatIndex) => {
          const player = table.players.find((item) => item.seatIndex === seatIndex);
          const position = seatPosition(seatIndex, table.seatCount);
          const chipPosition = committedPosition(seatIndex, table.seatCount);
          return (
            <div key={seatIndex}>
              {player && player.committed > 0 && (
                <div className="absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-gold/20 bg-background/90 px-2 py-0.5 font-mono text-[10px] text-gold" style={chipPosition}>
                  {player.committed}
                </div>
              )}
              <div className="absolute z-20 w-36 -translate-x-1/2 -translate-y-1/2" style={position}>
                {player?.talk && (
                  <div className="absolute bottom-[calc(100%+8px)] left-1/2 z-30 w-44 -translate-x-1/2 rounded-xl border border-gold/30 bg-card px-3 py-2 text-center text-[11px] leading-relaxed text-background shadow-xl">
                    “{player.talk}”
                  </div>
                )}
                {player
                  ? <PlayerSeat player={player} active={player.id === table.currentPlayerId} />
                  : <div className="flex h-16 items-center justify-center rounded-2xl border border-dashed border-felt-edge/60 bg-background/60 text-[9px] uppercase tracking-[0.22em] text-muted">Open</div>}
              </div>
            </div>
          );
        })}

        <p className="absolute left-3 top-1 font-mono text-[11px] capitalize text-muted">
          Hand {table.handNumber}{table.handsPerMatch ? `/${table.handsPerMatch}` : ""} · {table.street}
        </p>
      </div>
    </section>
  );
}

function seatPosition(seat: number, count: number): React.CSSProperties {
  const angle = Math.PI / 2 + (Math.PI * 2 * seat) / count;
  return { left: `${50 + Math.cos(angle) * 43}%`, top: `${50 + Math.sin(angle) * 43}%` };
}

function committedPosition(seat: number, count: number): React.CSSProperties {
  const angle = Math.PI / 2 + (Math.PI * 2 * seat) / count;
  return { left: `${50 + Math.cos(angle) * 28}%`, top: `${50 + Math.sin(angle) * 27}%` };
}
