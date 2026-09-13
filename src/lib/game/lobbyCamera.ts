import "server-only";
import type { LobbyCameraStatus } from "@/lib/types";

const g = globalThis as unknown as { __lobbyCameraStatuses?: Map<string, Map<string, LobbyCameraStatus>> };
const rooms = (g.__lobbyCameraStatuses ??= new Map<string, Map<string, LobbyCameraStatus>>());

export function setLobbyCameraStatus(code: string, playerId: string, status: LobbyCameraStatus): void {
  const room = rooms.get(code) ?? new Map<string, LobbyCameraStatus>();
  room.set(playerId, status);
  rooms.set(code, room);
}

export function getLobbyCameraStatuses(code: string, playerIds: string[]): Record<string, LobbyCameraStatus> {
  const room = rooms.get(code);
  return Object.fromEntries(playerIds.map((playerId) => [playerId, room?.get(playerId) ?? "not_started"]));
}
