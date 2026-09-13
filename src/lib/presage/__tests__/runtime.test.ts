import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runtimeIdentity } from "../../../../scripts/presage-runtime.mjs";

const directories: string[] = [];
const directory = () => { const dir = mkdtempSync(path.join(tmpdir(), "presage-runtime-")); directories.push(dir); return dir; };
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe("Linux measurement runtime identity", () => {
  it("reuses a private identifier across workers without leaving temporary files", () => {
    const dir = directory(), first = runtimeIdentity(dir);
    expect(first).toMatch(/^[a-f0-9]{32}$/);
    expect(runtimeIdentity(dir)).toBe(first);
    expect(readdirSync(dir)).toEqual(["device-id"]);
    expect(statSync(path.join(dir, "device-id")).mode & 0o777).toBe(0o600);
    expect(runtimeIdentity(directory())).not.toBe(first);
  });
  it("preserves an existing identifier and never silently replaces a corrupt one", () => {
    const dir = directory(), file = path.join(dir, "device-id");
    writeFileSync(file, "a".repeat(32) + "\n");
    expect(runtimeIdentity(dir)).toBe("a".repeat(32));
    writeFileSync(file, "incomplete");
    expect(() => runtimeIdentity(dir)).toThrow("identity is invalid");
    expect(readFileSync(file, "utf8")).toBe("incomplete");
  });
});
