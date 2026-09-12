/**
 * Table codes: four letters, consonants only (no vowels, no Y), so a code can never spell a word
 * and never contains the look-alikes I/O. 20^4 = 160,000 codes. Case-insensitive on input.
 */

const ALPHABET = "BCDFGHJKLMNPQRSTVWXZ";
const CODE = /^[BCDFGHJKLMNPQRSTVWXZ]{4}$/;

export function generateCode(taken: (code: string) => boolean): string {
  for (let i = 0; i < 500; i++) {
    let code = "";
    for (let k = 0; k < 4; k++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    if (!taken(code)) return code;
  }
  throw new Error("Could not allocate a table code");
}

/** Uppercase and strip anything that is not a code letter; use on every user-typed code. */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^BCDFGHJKLMNPQRSTVWXZ]/g, "").slice(0, 4);
}

export function isValidCode(code: string): boolean {
  return CODE.test(code);
}
