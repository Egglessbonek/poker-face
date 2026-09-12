/** 4-digit table code, 1000-9999, unique among `taken`. */
export function generateCode(taken: (code: string) => boolean): string {
  for (let i = 0; i < 200; i++) {
    const code = String(1000 + Math.floor(Math.random() * 9000));
    if (!taken(code)) return code;
  }
  throw new Error("Could not allocate a table code");
}

export function isValidCode(code: string): boolean {
  return /^[1-9]\d{3}$/.test(code);
}
