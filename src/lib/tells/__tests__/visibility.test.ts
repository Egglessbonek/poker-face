import { describe, expect, it } from "vitest";
import { tellAudiences, tellVisibilityFor, type TellAudiences } from "../visibility";

describe("tell visibility audiences", () => {
  it.each([
    [{ ai: false, rail: false, humans: false }, "off"],
    [{ ai: true, rail: false, humans: false }, "ai_only"],
    [{ ai: false, rail: true, humans: false }, "rail_only"],
    [{ ai: false, rail: false, humans: true }, "human_only"],
    [{ ai: true, rail: true, humans: false }, "ai_and_rail"],
    [{ ai: true, rail: false, humans: true }, "ai_and_humans"],
    [{ ai: false, rail: true, humans: true }, "rail_and_humans"],
    [{ ai: true, rail: true, humans: true }, "everyone"],
  ] as Array<[TellAudiences, string]>)("converts %o to %s", (audiences, visibility) => {
    expect(tellVisibilityFor(audiences)).toBe(visibility);
    expect(tellAudiences(visibility as ReturnType<typeof tellVisibilityFor>)).toEqual(audiences);
  });
});
