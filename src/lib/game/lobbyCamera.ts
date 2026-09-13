import "server-only";
import type { LobbyCameraStatus } from "@/lib/types";

const g = globalThis as unknown as {
  __lobbyCameraStatuses?: Map<string, Map<string, LobbyCameraStatus>>;
  __lobbyReadyStatuses?: Map<string, Map<string, boolean>>;
};
const rooms = (g.__lobbyCameraStatuses ??= new Map<string, Map<string, LobbyCameraStatus>>());
const readyRooms = (g.__lobbyReadyStatuses ??= new Map<string, Map<string, boolean>>());

export function setLobbyCameraStatus(code: string, playerId: string, status: LobbyCameraStatus): void {
  const room = rooms.get(code) ?? new Map<string, LobbyCameraStatus>();
  room.set(playerId, status);
  rooms.set(code, room);
}

export function getLobbyCameraStatuses(code: string, playerIds: string[]): Record<string, LobbyCameraStatus> {
  const room = rooms.get(code);
  return Object.fromEntries(playerIds.map((playerId) => [playerId, room?.get(playerId) ?? "not_started"]));
}

export function setLobbyReady(code: string, playerId: string, ready: boolean): void {
  const room = readyRooms.get(code) ?? new Map<string, boolean>();
  room.set(playerId, ready);
  readyRooms.set(code, room);
}

export function getLobbyReady(code: string, playerIds: string[]): Record<string, boolean> {
  const room = readyRooms.get(code);
  return Object.fromEntries(playerIds.map((playerId) => [playerId, room?.get(playerId) ?? false]));
}
