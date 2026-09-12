/** Ask the server whether a table code is live before navigating anywhere. */

import type { TablePhase } from "@/lib/types";

export type Lookup = { status: "ok"; phase: TablePhase; players: number } | { status: "missing" } | { status: "error" };

export async function lookupTable(code: string): Promise<Lookup> {
  try {
    const res = await fetch(`/api/table/${code}`, { cache: "no-store" });
    if (res.status === 404) return { status: "missing" };
    if (!res.ok) return { status: "error" };
    const data = (await res.json()) as { state?: { phase: TablePhase; players: unknown[] } };
    if (!data.state) return { status: "error" };
    return { status: "ok", phase: data.state.phase, players: data.state.players.length };
  } catch {
    return { status: "error" };
  }
}
