import { hasChannel } from "./bus";

/** 4-digit spectator code, 1000-9999, unique among open channels. */
export function generateRailCode(): string {
  for (let i = 0; i < 100; i++) {
    const code = String(1000 + Math.floor(Math.random() * 9000));
    if (!hasChannel(code)) return code;
  }
  throw new Error("Could not allocate a rail code");
}

export function isValidRailCode(code: string): boolean {
  return /^[1-9]\d{3}$/.test(code);
}
