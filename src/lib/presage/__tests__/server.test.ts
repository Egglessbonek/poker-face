import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import { pushVitals, readVitals, startVitals, stopVitals, stopTableVitals, updateVitalsContext, VitalsError } from "../server";
vi.mock("server-only", () => ({}));
vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
afterEach(() => { stopVitals("TEST", "a", undefined, true); stopVitals("TEST", "b", undefined, true); vi.unstubAllEnvs(); });
function worker() { const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() }); vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>); return child; }
describe("private native sessions", () => {
  it("carries qualified SDK measurements through references, completed-hand feedback and match shutdown", () => {
    vi.stubEnv("SMARTSPECTRA_API_KEY", "fake");
    let clock = 1_000_000;
    const date = vi.spyOn(Date, "now").mockImplementation(() => clock);
    const child = worker();
    const emit = (data: unknown) => child.stdout.write(JSON.stringify(data) + "\n");
    try {
      startVitals("TEST", "a");
      emit({ type: "ready" }); emit({ type: "validation", code: 0, hint: "" });
      const sample = (at: number, pulse: number) => {
        clock = at;
        emit({ type: "sample", pulse: { at, value: pulse, stable: true, confidence: 95 }, breathing: { at, value: 16, stable: true, confidence: 95 }, validation: { code: 0, hint: "" } });
      };
      for (let i = 0; i < 15; i++) sample(1_040_000 + i * 1000, 75);
      for (let i = 0; i < 3; i++) sample(1_070_000 + i * 1000, 85);
      clock = 1_074_000;
      updateVitalsContext("TEST", "a", [
        { at: 1_055_000, handNumber: 1, kind: "start", label: "Dealt" },
        { at: 1_070_000, handNumber: 1, kind: "action", playerId: "a", latencyMs: 1500, label: "Call" },
        { at: clock, handNumber: 1, kind: "end", label: "Ended" },
      ]);
      stopTableVitals("TEST"); child.emit("exit", 0);
      const view = readVitals("TEST", "a", true);
      expect(view.status).toBe("stopped"); expect(view.latest).toBeNull();
      expect(view.history).toHaveLength(18);
      expect(view.baseline).toEqual({ pulse: 75, breathing: 16 });
      expect(view.moments?.[0].text).toBe("Your median pulse was 85 BPM (+10 from your starting reference).");
      expect(view.moments?.[0].context).toContain("3 valid");
      expect(readVitals("TEST", "b", true).history).toEqual([]);
    } finally { stopVitals("TEST", "a", undefined, true); date.mockRestore(); }
  });
  it("preserves history across processing recovery, warms up again, and keeps SDK details server-side", () => {
    vi.stubEnv("SMARTSPECTRA_API_KEY", "fake");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const date = vi.spyOn(Date, "now"); let clock = 1_000_000;
    date.mockImplementation(() => clock);
    const first = worker(); let second: ReturnType<typeof worker> | undefined;
    try {
      const oldId = startVitals("TEST", "a"); clock += 40_000;
      const emit = (data: unknown) => first.stdout.write(JSON.stringify(data) + "\n");
      emit({ type: "ready" });
      emit({ type: "sample", pulse: { value: 80, stable: true, confidence: 95, at: clock }, validation: { code: 0, hint: "" } });
      emit({ type: "diagnostic", code: 8, retryable: true, detail: "Native processing detail", stage: "sdk" });
      emit({ type: "error", message: "Presage camera processing was interrupted.", retryable: true });
      expect(readVitals("TEST", "a").latest).toBeNull();
      expect(() => pushVitals("TEST", "a", oldId, new Uint8Array(), 0, [])).toThrow(VitalsError);
      stopVitals("TEST", "a", oldId); first.emit("exit", 1);
      // An EPIPE during teardown must not overwrite the useful SDK failure.
      first.stdin.emit("error", new Error("EPIPE"));
      expect(readVitals("TEST", "a").message).toBe("Presage camera processing was interrupted.");
      clock += 1000; second = worker(); const newId = startVitals("TEST", "a");
      expect(newId).not.toBe(oldId);
      second.stdout.write(JSON.stringify({ type: "ready" }) + "\n");
      second.stdout.write(JSON.stringify({ type: "validation", code: 0, hint: "" }) + "\n");
      stopVitals("TEST", "a", oldId);
      const view = readVitals("TEST", "a", true);
      expect(view.status).toBe("measuring");
      expect(view.history).toHaveLength(1);
      expect(view.latest?.pulse.value).toBeNull();
      expect(view.diagnostics?.restarts).toBe(1);
      expect(view.diagnostics?.lastFailure?.code).toBe(8);
      expect(JSON.stringify(view)).not.toContain("Native processing detail");
      expect(log).toHaveBeenCalledWith("[presage] SDK failure", expect.objectContaining({ detail: "Native processing detail" }));
    } finally {
      stopVitals("TEST", "a", undefined, true); second?.emit("exit", 0);
      date.mockRestore(); log.mockRestore();
    }
  });
  it("makes an unexpected native exit recoverable", () => {
    vi.stubEnv("SMARTSPECTRA_API_KEY", "fake");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const child = worker(); startVitals("TEST", "a"); child.emit("exit", null, "SIGSEGV");
      expect(readVitals("TEST", "a")).toMatchObject({ status: "error", retryable: true, latest: null });
    } finally { log.mockRestore(); }
  });
  it("recovers a native startup that never becomes ready", () => {
    vi.stubEnv("SMARTSPECTRA_API_KEY", "fake"); vi.useFakeTimers();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const child = worker();
    try {
      startVitals("TEST", "a"); vi.advanceTimersByTime(30_000);
      expect(readVitals("TEST", "a")).toMatchObject({ status: "error", retryable: true, message: expect.stringContaining("too long") });
      expect(child.stdin.writableEnded).toBe(true);
    } finally { child.emit("exit", 1); vi.useRealTimers(); log.mockRestore(); }
  });
  it("drops delayed uploads under backpressure and resumes without ending the session", () => {
    vi.stubEnv("SMARTSPECTRA_API_KEY", "fake");
    const child = worker(); const id = startVitals("TEST", "a");
    const write = vi.spyOn(child.stdin, "write");
    let at = Date.now();
    const push = () => {
      const bytes = new Uint8Array(16), header = new DataView(bytes.buffer);
      header.setUint32(0, 4, true); header.setFloat64(4, at++, true); bytes.set([255, 216, 255, 217], 12);
      pushVitals("TEST", "a", id, bytes, 0, []);
    };
    push(); expect(write).not.toHaveBeenCalled(); // Do not fill the pipe during native startup.
    child.stdout.write(JSON.stringify({ type: "ready" }) + "\n");
    Object.defineProperty(child.stdin, "writableNeedDrain", { configurable: true, value: true });
    push(); expect(write).not.toHaveBeenCalled();
    expect(readVitals("TEST", "a").message).toContain("catching up");
    expect(readVitals("TEST", "a").status).toBe("measuring");
    Object.defineProperty(child.stdin, "writableNeedDrain", { configurable: true, value: false });
    push(); expect(write).toHaveBeenCalledTimes(1);
    expect(readVitals("TEST", "a").message).toBe("Gathering measurements");
    stopVitals("TEST", "a"); child.emit("exit", 0);
  });
  it("isolates players, rejects stale stop requests and redacts invalid values", () => {
    vi.stubEnv("SMARTSPECTRA_API_KEY", "fake");
    const child = worker(); const id = startVitals("TEST", "a");
    expect(readVitals("TEST", "b", true).history).toEqual([]);
    expect(readVitals("TEST", "b").sessionId).toBeNull();
    child.stdout.write(JSON.stringify({ type: "ready" }) + "\n");
    expect(readVitals("TEST", "a").status).toBe("measuring");
    stopVitals("TEST", "a", "old-session");
    expect(readVitals("TEST", "a").status).toBe("measuring");
    child.stdout.write(JSON.stringify({ type: "sample", at: Date.now(), pulse: { value: 90, stable: true, confidence: 99 }, validation: { code: 0, hint: "" } }) + "\n");
    expect(readVitals("TEST", "a", true).history[0].pulse.value).toBeNull(); // warm-up
    stopVitals("TEST", "a", id);
    expect(readVitals("TEST", "a").latest).toBeNull();
    expect(child.stdin.writableEnded).toBe(true);
    child.emit("exit", 0);
  });
  it("caps workers and releases capacity on stop", () => {
    vi.stubEnv("SMARTSPECTRA_API_KEY", "fake"); vi.stubEnv("PRESAGE_MAX_SESSIONS", "1");
    const child = worker(); startVitals("TEST", "a");
    expect(() => startVitals("TEST", "b")).toThrow(/capacity/);
    stopVitals("TEST", "a"); child.emit("exit", 0);
    const second = worker(); expect(startVitals("TEST", "b")).toBeTruthy(); stopVitals("TEST", "b"); second.emit("exit", 0);
  });
});

it("keeps pipeline telemetry private and qualifies chest loss per metric", () => {
  vi.stubEnv("SMARTSPECTRA_API_KEY", "fake");
  let clock = 1_000_000;
  const date = vi.spyOn(Date, "now").mockImplementation(() => clock);
  const child = worker();
  try {
    startVitals("TEST", "a");
    clock += 40_000;
    child.stdout.write(JSON.stringify({ type: "ready" }) + "\n");
    child.stdout.write(JSON.stringify({ type: "validation", code: 7, hint: "Chest not visible" }) + "\n");
    child.stdout.write(JSON.stringify({ type: "pipeline", stats: { at: clock, fps: 30, submitted: 100, dropped: 2, decodeMs: 1, sourceAgeMs: 100, queued: 0 } }) + "\n");
    child.stdout.write(JSON.stringify({ type: "sample", pulse: { value: 80, confidence: 90, stable: true, at: clock }, breathing: { value: 16, confidence: 90, stable: true, at: clock }, validation: { code: 7, hint: "Chest not visible" } }) + "\n");
    const own = readVitals("TEST", "a");
    expect(own.latest?.pulse.value).toBe(80);
    expect(own.latest?.breathing.value).toBeNull();
    expect(own.diagnostics?.pipeline?.fps).toBe(30);
    expect(readVitals("TEST", "b").diagnostics?.pipeline).toBeNull();
    clock += 4000;
    expect(readVitals("TEST", "a").latest?.pulse.value).toBeNull();
    expect(readVitals("TEST", "a").lastGood?.pulse?.value).toBe(80);
    stopVitals("TEST", "a", undefined, true);
    expect(readVitals("TEST", "a").lastGood?.pulse).toBeNull();
    expect(readVitals("TEST", "a").diagnostics?.pipeline).toBeNull();
  } finally { stopVitals("TEST", "a", undefined, true); child.emit("exit", 0); date.mockRestore(); }
});
