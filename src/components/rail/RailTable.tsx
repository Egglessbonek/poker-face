import PokerTable, { type PokerSeatView } from "@/components/poker/PokerTable";
import type { Card, Suit } from "@/lib/types";
import type { RailCard, RailTableSnapshot } from "./model";

const SUIT_CODE: Record<RailCard["suit"], Suit> = { spades: "s", hearts: "h", diamonds: "d", clubs: "c" };
function cardCode(card: RailCard): Card { return `${card.rank}${SUIT_CODE[card.suit]}` as Card; }

/** Spectator-only details stay in this adapter; table geometry is shared with gameplay. */
export default function RailTable({ table }: { table: RailTableSnapshot }) {
  const players: PokerSeatView[] = table.players.map((player) => ({
    id: player.id, seat: player.seatIndex, name: player.name, kind: player.kind,
    stack: player.stack, committed: player.committed, cards: player.cardsVisible ? player.cards.map(cardCode) : [],
    inHand: player.inHand, folded: player.folded, allIn: player.allIn, button: player.isButton,
    blind: player.isSmallBlind ? "SB" : player.isBigBlind ? "BB" : undefined,
    status: player.id === table.currentPlayerId && player.kind === "ai" ? "thinking…" : player.lastAction ?? player.position,
    talk: player.talk ? { text: player.talk } : undefined,
    detail: <div className="flex items-baseline justify-between gap-2"><span className="min-w-0 truncate" title={player.bestHand}>{!player.inHand ? "Not in hand" : player.bestHand ?? "Calculating…"}</span><span className="shrink-0 font-mono text-gold">{player.inHand && player.equity !== undefined ? `${player.equity}%` : "—"}</span></div>,
  }));
  return <PokerTable players={players} seatCount={table.seatCount} board={table.board.map(cardCode)}
    pots={table.pots} handNumber={table.handNumber} handsPerMatch={table.handsPerMatch} street={table.street}
    currentPlayerId={table.currentPlayerId} turnDeadline={table.turnDeadline} turnStartedAt={table.turnStartedAt}
    secondsRemaining={table.turnSecondsRemaining} />;
}
