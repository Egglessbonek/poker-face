/** Seat identity per table, kept in localStorage so a refresh keeps the seat. */

export interface Identity {
  playerId: string;
  token: string;
  name: string;
}

const key = (code: string) => `pf:${code}`;

export function loadIdentity(code: string): Identity | null {
  try {
    const raw = localStorage.getItem(key(code));
    return raw ? (JSON.parse(raw) as Identity) : null;
  } catch {
    return null;
  }
}

export function saveIdentity(code: string, id: Identity): void {
  try {
    localStorage.setItem(key(code), JSON.stringify(id));
    localStorage.setItem("pf:name", id.name);
  } catch {
    /* private mode */
  }
}

export function clearIdentity(code: string): void {
  try {
    localStorage.removeItem(key(code));
  } catch {
    /* ignore */
  }
}

export function lastName(): string {
  try {
    return localStorage.getItem("pf:name") ?? "";
  } catch {
    return "";
  }
}

export async function api<T = { ok: true }>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}
