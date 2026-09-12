/**
 * Rematch helpers. Pure and free of the `server-only` marker so vitest can load them; only the server
 * table (table.ts) imports this module.
 */

import type { Player } from "@/lib/types";

/** OpenRouter model ids of the AI seats in seat order, duplicates preserved: the guest list for a rematch. */
export function aiGuestList(players: Player[]): string[] {
  return [...players].sort((a, b) => a.seat - b.seat).flatMap((p) => (p.kind === "ai" && p.modelId ? [p.modelId] : []));
}
