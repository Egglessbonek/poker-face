import type { TellVisibility } from "@/lib/types";

export interface TellAudiences {
  ai: boolean;
  rail: boolean;
  humans: boolean;
}

const AUDIENCES: Record<TellVisibility, TellAudiences> = {
  ai_and_rail: { ai: true, rail: true, humans: false },
  ai_and_humans: { ai: true, rail: false, humans: true },
  rail_and_humans: { ai: false, rail: true, humans: true },
  everyone: { ai: true, rail: true, humans: true },
  ai_only: { ai: true, rail: false, humans: false },
  rail_only: { ai: false, rail: true, humans: false },
  human_only: { ai: false, rail: false, humans: true },
  off: { ai: false, rail: false, humans: false },
};

export function tellAudiences(visibility: TellVisibility): TellAudiences {
  return AUDIENCES[visibility];
}

export function tellVisibilityFor(audiences: TellAudiences): TellVisibility {
  const key = `${Number(audiences.ai)}${Number(audiences.rail)}${Number(audiences.humans)}`;
  const visibility: Record<string, TellVisibility> = {
    "000": "off",
    "001": "human_only",
    "010": "rail_only",
    "011": "rail_and_humans",
    "100": "ai_only",
    "101": "ai_and_humans",
    "110": "ai_and_rail",
    "111": "everyone",
  };
  return visibility[key];
}
