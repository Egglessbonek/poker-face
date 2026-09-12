import { handle } from "@/lib/game/http";
import { getState } from "@/lib/game/table";
import { knownTableEquities } from "@/lib/poker/equity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const equities = knownTableEquities(players, hand.board);
    return {
      handNumber: hand.handNumber,
      players: Object.fromEntries(Object.entries(equities).map(([id, result]) => [id, {
        equity: Math.round(result.equity * 1000) / 10,
        bestHand: result.bestHand,
      }])),
    };
  });
}
