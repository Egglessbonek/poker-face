import { Bot, CircleDollarSign } from "lucide-react";
import type { RailCard, RailPlayerView, RailTableSnapshot } from "./model";

const SUIT_SYMBOL: Record<RailCard["suit"], string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

function PlayingCard({ card, compact = false }: { card: RailCard; compact?: boolean }) {
  const red = card.suit === "hearts" || card.suit === "diamonds";
  return (
    <div
      role="img"
      aria-label={`${card.rank} of ${card.suit}`}
      className={`${compact ? "h-12 w-9 rounded-md text-sm" : "h-16 w-11 rounded-lg text-base"} flex shrink-0 flex-col justify-between border border-black/10 bg-card p-1.5 font-mono font-bold shadow-[0_5px_14px_rgba(0,0,0,0.28)] ${red ? "text-red-600" : "text-slate-950"}`}
    >
      <span>{card.rank}</span>
      <span className="self-end text-lg leading-none">{SUIT_SYMBOL[card.suit]}</span>
    </div>
  );
}

function HiddenCards() {
  return (
    <div className="flex -space-x-1.5" role="img" aria-label="Cards hidden">
      {[0, 1].map((index) => (
        <div key={index} className="h-12 w-9 rounded-md border border-white/20 bg-[repeating-linear-gradient(45deg,#142f27,#142f27_4px,#0c201a_4px,#0c201a_8px)] shadow-[0_5px_14px_rgba(0,0,0,0.28)]" />
      ))}
    </div>
  );
}

function SeatBadges({ player }: { player: RailPlayerView }) {
  return (
    <div className="flex items-center gap-1">
      {player.isButton && <span className="rounded-full bg-card px-1.5 py-0.5 text-[10px] font-black text-slate-900">D</span>}
      {player.isSmallBlind && <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/70">SB</span>}
      {player.isBigBlind && <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/70">BB</span>}
      {player.allIn && <span className="rounded bg-chip-red px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">All-in</span>}
    </div>
  );
}

function PlayerSeat({ player, active, seatCount, mobile = false }: { player: RailPlayerView; active: boolean; seatCount: number; mobile?: boolean }) {
  const body = (
    <div className={`relative w-full rounded-2xl border bg-[#101714]/95 p-2.5 shadow-xl transition-all ${active ? "border-gold shadow-[0_0_0_3px_rgba(212,175,55,0.18),0_16px_30px_rgba(0,0,0,0.4)]" : "border-white/10"} ${player.folded ? "opacity-55" : ""}`}>
      {active && <span className="absolute -top-1 left-4 right-4 h-0.5 animate-pulse rounded-full bg-gold" />}
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {player.kind === "ai" && <Bot size={14} className="text-gold" aria-label="AI player" />}
            <p className="truncate text-sm font-semibold text-white">{player.name}</p>
          </div>
          <p className="text-xs text-white/45">{player.kind === "ai" ? player.persona : "Human"} · {player.position}</p>
        </div>
        <SeatBadges player={player} />
      </div>
      <div className="flex items-end justify-between gap-2">
        {player.cardsVisible
          ? <div className="flex -space-x-1.5">{player.cards.map((card, index) => <PlayingCard key={`${player.id}-${index}`} card={card} compact />)}</div>
          : <HiddenCards />}
        <div className="text-right">
          <p className="font-mono text-sm font-semibold text-gold">${player.stack}</p>
          <p className="mt-0.5 text-[11px] text-white/50">{player.lastAction ?? "Waiting"}</p>
        </div>
      </div>
      {player.committed > 0 && (
        <div className="mt-2 flex items-center justify-end gap-1 text-xs text-white/60">
          <CircleDollarSign size={12} className="text-chip-blue" /> ${player.committed} in front
        </div>
      )}
    </div>
  );

  if (mobile) {
    return (
      <div>
        {body}
        {player.talk && <div className="mt-1.5 rounded-xl border border-gold/25 bg-gold px-3 py-2 text-xs font-medium leading-relaxed text-black">“{player.talk}”</div>}
      </div>
    );
  }
  // Seats sit evenly around the felt for however many chairs the host set; seat 0 is at the top.
  const angle = (player.seatIndex / Math.max(seatCount, 2)) * Math.PI * 2 - Math.PI / 2;
  const x = 50 + Math.cos(angle) * 43;
  const y = 50 + Math.sin(angle) * 37;
  // Speech bubbles open toward the middle: seats on the right half speak to their left.
  const talkSide = Math.cos(angle) > 0.01 ? "right-[calc(100%+0.5rem)]" : "left-[calc(100%+0.5rem)]";
  return (
    <div className="absolute z-10 w-44 -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }}>
      {body}
      {player.talk && (
        <div className={`absolute top-1/2 z-20 w-44 -translate-y-1/2 rounded-xl border border-gold/25 bg-gold px-3 py-2 text-xs font-medium leading-relaxed text-black shadow-xl ${talkSide}`}>
          “{player.talk}”
        </div>
      )}
    </div>
  );
}

function PotDisplay({ table }: { table: RailTableSnapshot }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {table.pots.map((pot) => (
        <div key={pot.id} className="rounded-full border border-gold/20 bg-black/30 px-3 py-1 text-center backdrop-blur">
          <span className="mr-2 text-xs text-white/50">{pot.label}</span>
          <span className="font-mono text-sm font-semibold text-gold">${pot.amount}</span>
        </div>
      ))}
    </div>
  );
}

export default function RailTable({ table }: { table: RailTableSnapshot }) {
  return (
    <section aria-label="Poker table" className="rounded-[2rem] border border-white/10 bg-[#0c1210] p-3 shadow-[0_24px_80px_rgba(0,0,0,0.42)] sm:p-5 xl:h-full">
      <div className="relative hidden h-full min-h-[570px] lg:block xl:min-h-0">
        <div className="absolute inset-[10%_8%] rounded-[48%] border-[10px] border-[#143d31] bg-[radial-gradient(circle_at_center,#14533e_0%,#0d3b2d_58%,#08281f_100%)] shadow-[inset_0_0_70px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,255,255,0.08)]">
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/35">{table.street}</p>
            <div className="flex gap-2">
              {table.board.map((card, index) => <PlayingCard key={`board-${index}`} card={card} />)}
              {Array.from({ length: 5 - table.board.length }).map((_, index) => (
                <div key={`empty-${index}`} className="h-16 w-11 rounded-lg border border-dashed border-white/15 bg-black/10" />
              ))}
            </div>
            <PotDisplay table={table} />
          </div>
        </div>
        {table.players.map((player) => <PlayerSeat key={player.id} player={player} active={player.id === table.currentPlayerId} seatCount={table.seatCount} />)}
      </div>

      <div className="lg:hidden">
        <div className="mb-4 rounded-[2rem] border-4 border-[#143d31] bg-[radial-gradient(circle_at_center,#14533e,#08281f)] px-3 py-6">
          <p className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.24em] text-white/40">{table.street}</p>
          <div className="flex justify-center gap-1.5">
            {table.board.map((card, index) => <PlayingCard key={`mobile-board-${index}`} card={card} compact />)}
          </div>
          <div className="mt-4"><PotDisplay table={table} /></div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {table.players.map((player) => <PlayerSeat key={player.id} player={player} active={player.id === table.currentPlayerId} seatCount={table.seatCount} mobile />)}
        </div>
      </div>
    </section>
  );
}
