import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type TableModule = typeof import("@/lib/game/table");
let table: TableModule;

describe("table visibility", () => {
  beforeEach(async () => {
    delete (globalThis as { __tables?: unknown }).__tables;
    delete (globalThis as { __tableBus?: unknown }).__tableBus;
    delete (globalThis as { __tableLogs?: unknown }).__tableLogs;
    vi.resetModules();
    table = await import("@/lib/game/table");
  });

  it("keeps the creator in public listings when hosting transfers", async () => {
    const created = await table.createTable({ aiPlayers: [] }, "Original Host");
    const guest = table.joinTable(created.code, "Next Host");
    table.leaveTable(created.code, created.token);
    expect(table.getState(created.code, { kind: "rail" }).hostId).toBe(guest.playerId);
    expect(table.listOpenTables().find(entry => entry.code === created.code)?.creatorName).toBe("Original Host");
  });

  it("creates public tables by default and lists them", async () => {
    const created = await table.createTable({ aiPlayers: [] }, "Public Host");

    expect(table.getState(created.code, { kind: "rail" }).isPublic).toBe(true);
    expect(table.listOpenTables().map((entry) => entry.code)).toContain(created.code);
  });

  it("keeps private tables reachable by code but out of browse results", async () => {
    const created = await table.createTable({ aiPlayers: [] }, "Private Host", false);

    expect(table.getState(created.code, { kind: "rail" }).isPublic).toBe(false);
    expect(table.listOpenTables().map((entry) => entry.code)).not.toContain(created.code);
  });

  it("lets only the host change visibility while the table is in the lobby", async () => {
    const created = await table.createTable({ aiPlayers: [], turnTimerSec: 0 }, "Host", false);
    const guest = table.joinTable(created.code, "Guest");

    expect(() => table.updateVisibility(created.code, guest.token, true)).toThrow("Host only");
    table.updateVisibility(created.code, created.token, true);
    expect(table.listOpenTables().map((entry) => entry.code)).toContain(created.code);

    table.startTable(created.code, created.token);
    expect(() => table.updateVisibility(created.code, created.token, false)).toThrow("Visibility can only change before the game starts");
  });
});
