import { describe, expect, it } from "vitest";
import { generateCode, isValidCode, normalizeCode } from "../code";

describe("table codes", () => {
  it("generates four consonants", () => {
    for (let i = 0; i < 200; i++) expect(generateCode(() => false)).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
  });
  it("avoids taken codes", () => {
    const taken = new Set(["BCDF"]);
    for (let i = 0; i < 50; i++) expect(taken.has(generateCode((c) => taken.has(c)))).toBe(false);
  });
  it("normalizes user input", () => {
    expect(normalizeCode("kx tr")).toBe("KXTR");
    expect(normalizeCode("k-x-t-r-z")).toBe("KXTR");
    expect(normalizeCode("aeio")).toBe("");
  });
  it("validates strictly", () => {
    expect(isValidCode("KXTR")).toBe(true);
    expect(isValidCode("kxtr")).toBe(false);
    expect(isValidCode("KXT")).toBe(false);
    expect(isValidCode("4821")).toBe(false);
    expect(isValidCode("KAXT")).toBe(false);
  });
});
