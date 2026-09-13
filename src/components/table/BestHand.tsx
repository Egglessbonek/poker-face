import { Hand } from "pokersolver";
import type { Card } from "@/lib/types";

/** Uses only the seated player's private cards and the public board. */
export default function BestHand({ hole, board, folded }: { hole: Card[]; board: Card[]; folded: boolean }) {
  if (hole.length !== 2) return null;
  const best = Hand.solve([...hole, ...board]);
  return <p className="min-w-0 truncate text-xs text-muted" aria-label="Your best hand" title={best.descr}><span>{folded ? "Your folded hand" : "Your best hand"}</span> <span className="ml-2 font-medium text-gold">{best.descr}</span></p>;
}
