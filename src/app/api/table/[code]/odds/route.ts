import { handle } from "@/lib/game/http";
import { getState } from "@/lib/game/table";
import { knownTableEquities } from "@/lib/poker/equity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RailOddsResponse {
  handNumber: number;
  players: Record<string, { equity: number; bestHand: string }>;
}

// The calculation is deterministic for a given dealt state, so every spectator can share it.
// Keep this bounded because tables and hands are created over the lifetime of the server process.
const ODDS_CACHE_LIMIT = 128;
const oddsCache = new Map<string, RailOddsResponse>();

function rememberOdds(key: string, value: RailOddsResponse): RailOddsResponse {
  oddsCache.set(key, value);
  if (oddsCache.size > ODDS_CACHE_LIMIT) {
    const oldest = oddsCache.keys().next().value;
    if (oldest) oddsCache.delete(oldest);
  }
  return value;
}

/** GET -> exact-known-hand broadcast odds for the rail viewer. */
export async function GET(_req: Request, ctx: RouteContext<"/api/table/[code]/odds">) {
  const { code } = await ctx.params;
  return handle(() => {
    const state = getState(code, { kind: "rail" });
    const hand = state.hand;
    if (!hand) return { handNumber: state.handNumber, players: {} };

    const players = hand.seats.flatMap((seat) => seat
      ? [{ id: seat.playerId, hole: seat.holeCards, folded: seat.folded }]
      : []);
    const cacheKey = [code, hand.handNumber, hand.street, hand.board.join(","), ...players.map((player) => `${player.id}:${player.hole.join(",")}:${player.folded}`)].join("|");
    const cached = oddsCache.get(cacheKey);
    if (cached) return cached;

    const equities = knownTableEquities(players, hand.board);
    return rememberOdds(cacheKey, {
      handNumber: hand.handNumber,
      players: Object.fromEntries(Object.entries(equities).map(([id, result]) => [id, {
        equity: Math.round(result.equity * 1000) / 10,
        bestHand: result.bestHand,
      }])),
    });
  });
}
