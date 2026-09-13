import type { NextRequest } from "next/server";
import { body, handle } from "@/lib/game/http";
import { getLobbyCameraStatuses, setLobbyCameraStatus } from "@/lib/game/lobbyCamera";
import { getState, resolveViewer, TableError } from "@/lib/game/table";
import type { LobbyCameraStatus, Viewer } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES: LobbyCameraStatus[] = ["not_started", "setting_up", "skipped", "ready"];

function playerViewer(code: string, token: string | null): Extract<Viewer, { kind: "player" }> {
  const viewer = resolveViewer(code, token);
  if (viewer.kind !== "player") throw new TableError("A player seat is required", 401);
  return viewer;
}

/** Camera readiness is lobby presence only; no images or biometric data are sent here. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/table/[code]/camera">) {
  const { code } = await ctx.params;
  return handle(() => {
    const viewer = playerViewer(code, req.nextUrl.searchParams.get("token"));
    const state = getState(code, viewer);
    return { statuses: getLobbyCameraStatuses(code, state.players.map((player) => player.id)) };
  });
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/table/[code]/camera">) {
  const { code } = await ctx.params;
  const input = await body<{ token?: string; status?: LobbyCameraStatus }>(req);
  return handle(() => {
    const viewer = playerViewer(code, input.token ?? null);
    const state = getState(code, viewer);
    if (state.phase !== "lobby") throw new TableError("Camera readiness only changes in the lobby", 409);
    if (!input.status || !STATUSES.includes(input.status)) throw new TableError("Invalid camera readiness status");
    setLobbyCameraStatus(code, viewer.playerId, input.status);
    return { statuses: getLobbyCameraStatuses(code, state.players.map((player) => player.id)) };
  });
}
