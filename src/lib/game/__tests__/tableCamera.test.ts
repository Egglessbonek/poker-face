import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type TableModule = typeof import("@/lib/game/table");
type CameraModule = typeof import("@/lib/game/lobbyCamera");

let table: TableModule;
let camera: CameraModule;

describe("camera-required table lifecycle", () => {
  beforeEach(async () => {
    delete (globalThis as { __tables?: unknown }).__tables;
    delete (globalThis as { __tableBus?: unknown }).__tableBus;
    delete (globalThis as { __tableLogs?: unknown }).__tableLogs;
    delete (globalThis as { __lobbyCameraStatuses?: unknown }).__lobbyCameraStatuses;
    delete (globalThis as { __lobbyReadyStatuses?: unknown }).__lobbyReadyStatuses;
    vi.resetModules();
    table = await import("@/lib/game/table");
    camera = await import("@/lib/game/lobbyCamera");
  });

  it("requires every human camera before the host can deal", async () => {
    const created = await table.createTable({ aiPlayers: [], turnTimerSec: 0 }, "Host");
    table.joinTable(created.code, "Guest");
    const humans = table.getState(created.code, { kind: "rail" }).players.filter((player) => player.kind === "human");

    expect(() => table.startTable(created.code, created.token)).toThrow("Camera setup is required for Host, Guest");
    camera.setLobbyCameraStatus(created.code, humans[0].id, "ready");
    expect(() => table.startTable(created.code, created.token)).toThrow("Camera setup is required for Guest");
    camera.setLobbyCameraStatus(created.code, humans[1].id, "ready");
    expect(() => table.startTable(created.code, created.token)).not.toThrow();
    expect(table.getState(created.code, { kind: "rail" }).phase).toBe("playing");
  });

  it("keeps a late joiner active while camera setup finishes", async () => {
    const created = await table.createTable({ aiPlayers: [], turnTimerSec: 0 }, "Host");
    const opponent = table.joinTable(created.code, "Opponent");
    const initialHumans = table.getState(created.code, { kind: "rail" }).players.filter((player) => player.kind === "human");
    for (const player of initialHumans) camera.setLobbyCameraStatus(created.code, player.id, "ready");
    table.startTable(created.code, created.token);

    const late = table.joinTable(created.code, "Late Player");
    let latePlayer = table.getState(created.code, { kind: "rail" }).players.find((player) => player.id === late.playerId);
    expect(latePlayer?.sittingOut).toBe(false);

    camera.setLobbyCameraStatus(created.code, late.playerId, "ready");
    latePlayer = table.getState(created.code, { kind: "rail" }).players.find((player) => player.id === late.playerId);
    expect(latePlayer?.sittingOut).toBe(false);

    // Keep the second identity exercised so this setup cannot silently collapse to a one-player table.
    expect(opponent.playerId).toBe(initialHumans[1].id);
  });
});
