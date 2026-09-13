import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { describePresageError, redactPresageDetail } from "../../../../scripts/presage-errors.mjs";

let fixture: string;
beforeAll(() => {
  fixture = mkdtempSync(path.join(tmpdir(), "presage-worker-test-"));
  writeFileSync(path.join(fixture, "sdk.mjs"), `
    export const SmartSpectraLogLevel = { kNone: 4 }, PixelFormat = { kRGB: 0 };
    export const decodeMetrics = value => value;
    export class SmartSpectraSDK {
      callbacks = {};
      on(name, fn) { this.callbacks[name] = fn; }
      useCustomInput() {}
      start() {
        const code = Number(process.env.TEST_ERROR_CODE);
        const message = 'SDK detail ' + process.env.SMARTSPECTRA_API_KEY;
        if (process.env.TEST_STAGE === 'startup') throw Object.assign(new Error(message), { code, retryable: false });
        if (process.env.TEST_STAGE === 'callback') setImmediate(() => this.callbacks.error(code, message, false));
      }
      sendFrame(_data, _w, _h, _stride, _format, at) {
        this.callbacks.metrics({ cardio: { pulseRate: [{value: 80, confidence: 95, stable: true, timestamp: at}] } }, at);
        return true;
      }
      async destroy() {}
    }
  `);
  const sdkUrl = pathToFileURL(path.join(fixture, "sdk.mjs")).href;
  writeFileSync(path.join(fixture, "runtime.mjs"), "export function preparePresageRuntime() {}\n");
  const runtimeUrl = pathToFileURL(path.join(fixture, "runtime.mjs")).href;
  writeFileSync(path.join(fixture, "loader.mjs"), `export async function resolve(name, context, next) {
    if (name === './presage-runtime.mjs') return { url: ${JSON.stringify(runtimeUrl)}, shortCircuit: true };
    return name === '@smartspectra/node-sdk' ? { url: ${JSON.stringify(sdkUrl)}, shortCircuit: true } : next(name, context);
  }`);
});
afterAll(() => rmSync(fixture, { recursive: true, force: true }));

function runWorker(stage: string, errorCode = 8, frames?: Buffer) {
  return new Promise<{ code: number | null; events: Array<Record<string, unknown>>; output: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ["--loader", path.join(fixture, "loader.mjs"), "scripts/presage-worker.mjs"], {
      env: { NODE_ENV: "test", PATH: process.env.PATH, SMARTSPECTRA_API_KEY: "test-private-key", TEST_STAGE: stage, TEST_ERROR_CODE: String(errorCode) },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "", sent = false;
    const timeout = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Worker did not finish")); }, 8000);
    child.stdout.on("data", chunk => {
      output += chunk;
      if (frames && !sent && output.includes('"ready"')) {
        sent = true; let offset = 0, at = Date.now();
        while (offset < frames.length) { frames.writeDoubleLE(at++, offset + 4); offset += frames.readUInt32LE(offset) + 12; }
        child.stdin.write(frames);
      }
      if (output.includes('"sample"')) child.stdin.end();
    });
    child.stderr.resume();
    child.on("error", reject);
    child.on("exit", code => {
      clearTimeout(timeout);
      resolve({ code, output, events: output.trim().split("\n").filter(Boolean).map(line => JSON.parse(line)) });
    });
  });
}

describe("native worker failures", () => {
  it.each([1, 5, 6, 7, 8, 9, 10, 11])("allows bounded fresh-process recovery for SDK code %i", code => {
    expect(describePresageError({ code, retryable: false }).retryable).toBe(true);
  });
  it.each([2, 3, 4])("does not retry account/configuration code %i", code => {
    expect(describePresageError({ code, retryable: true }).retryable).toBe(false);
  });
  it("retains the SDK code and safe diagnostics when processing fails asynchronously", async () => {
    const result = await runWorker("callback");
    expect(result.code).toBe(1);
    expect(result.events).toContainEqual(expect.objectContaining({ type: "error", code: 8, retryable: true }));
    expect(result.events).toContainEqual(expect.objectContaining({ type: "diagnostic", detail: "SDK detail [redacted]", stage: "sdk" }));
    expect(result.output).not.toContain("test-private-key");
  });
  it("reports synchronous startup failures with their actual classification", async () => {
    const result = await runWorker("startup", 4);
    expect(result.code).toBe(1);
    expect(result.events).toContainEqual(expect.objectContaining({ type: "error", code: 4, retryable: false, message: expect.stringContaining("credits are exhausted") }));
    expect(result.events.some(event => event.type === "ready")).toBe(false);
  });
  it("continues collecting after a malformed JPEG instead of stopping measurement", async () => {
    const jpeg = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#888" } }).jpeg().toBuffer();
    const packet = (data: Buffer, at: number) => {
      const bytes = Buffer.alloc(data.length + 12);
      bytes.writeUInt32LE(data.length); bytes.writeDoubleLE(at, 4); data.copy(bytes, 12); return bytes;
    };
    const result = await runWorker("frames", 0, Buffer.concat([packet(Buffer.from([255, 216, 255, 217]), Date.now()), packet(jpeg, Date.now() + 1)]));
    expect(result.code).toBe(0);
    expect(result.events.some(event => event.type === "sample")).toBe(true);
    expect(result.events.some(event => event.type === "error")).toBe(false);
  });
  it("redacts credential formats and bounds server log details", () => {
    expect(redactPresageDetail("Bearer secret https://example.test?api_key=abc&token=def", "abc")).not.toMatch(/secret|abc|def/);
    expect(redactPresageDetail("x".repeat(3000))).toHaveLength(2000);
  });
});
