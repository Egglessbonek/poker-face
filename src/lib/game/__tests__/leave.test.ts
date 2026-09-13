import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createTable, endTable, getState, joinTable, leaveTable, startTable } from "../table";
import { setLobbyCameraStatus } from "../lobbyCamera";

vi.mock("server-only", () => ({}));
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

async function room(start = true) {
  const host = await createTable({ maxSeats: 3, aiPlayers: [], turnTimerSec: 120, handsPerMatch: 1 }, "Host");
  const guest = joinTable(host.code, "Guest");
  const other = joinTable(host.code, "Other");
  if (start) {
    for (const player of getState(host.code, { kind: "rail" }).players) setLobbyCameraStatus(host.code, player.id, "ready");
    startTable(host.code, host.token);
  }
  const state = () => getState(host.code, { kind: "rail" });
  return { host, guest, other, state };
}

describe("leaving a table", () => {
  it("lets a guest leave off-turn without ending the match; folds them when action arrives", async () => {
    const { host, guest, state } = await room();
    leaveTable(host.code, guest.token);
    expect(state().phase).toBe("playing");
    expect(state().players.find((p) => p.id === guest.playerId)?.sittingOut).toBe(true);
    expect(state().hand?.seats[1]?.folded).toBe(false);
    act(host.code, host.token, { type: "call" }, null);
    expect(state().hand?.seats[1]?.folded).toBe(true);
    expect(state().hand?.toAct).toBe(2);
  });

  it("folds a departing player even when checking is free", async () => {
    const { host, guest, other, state } = await room();
    act(host.code, host.token, { type: "call" }, null);
    act(host.code, guest.token, { type: "call" }, null);
    leaveTable(host.code, other.token);
    expect(state().hand?.seats[2]?.folded).toBe(true);
    expect(state().phase).toBe("playing");
    expect(state().hand?.street).toBe("flop");
  });

  it("keeps an all-in departure eligible for the current pot", async () => {
    const { host, guest, state } = await room();
    act(host.code, host.token, { type: "call" }, null);
    act(host.code, guest.token, { type: "allin" }, null);
    leaveTable(host.code, guest.token);
    expect(state().hand?.seats[1]?.allIn).toBe(true);
    expect(state().hand?.seats[1]?.folded).toBe(false);
  });

  it("restricts ending to the host and transfers hosting if that host leaves", async () => {
    const { host, guest, state } = await room();
    expect(() => endTable(host.code, guest.token)).toThrow();
    leaveTable(host.code, host.token);
    expect(state().phase).toBe("playing");
    expect(state().hostId).toBe(guest.playerId);
    expect(() => endTable(host.code, host.token)).toThrow();
    endTable(host.code, guest.token);
    expect(state().phase).toBe("finished");
  });

  it("also lets the host leave a populated lobby without closing it", async () => {
    const { host, guest, state } = await room(false);
    leaveTable(host.code, host.token);
    expect(state().phase).toBe("lobby");
    expect(state().hostId).toBe(guest.playerId);
    expect(state().players).toHaveLength(2);
  });
});
