/**
 * In-memory session store (globalThis-backed, same pattern as Haggle's store.ts).
 * Single-process deployment only. Swap for Redis if multi-instance is ever needed.
 */

import type { Session, SessionLogEntry } from "@/lib/types";

const g = globalThis as unknown as { __sessions?: Map<string, Session> };
const sessions = (g.__sessions ??= new Map<string, Session>());

export function createSession(input: Pick<Session, "id" | "railCode" | "personaId">): Session {
  const s: Session = { ...input, startedAt: Date.now(), log: [] };
  sessions.set(s.id, s);
  return s;
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export function appendLog(id: string, entry: Omit<SessionLogEntry, "t"> & { t?: number }): void {
  const s = sessions.get(id);
  if (!s) return;
  s.log.push({ t: entry.t ?? Date.now(), kind: entry.kind, data: entry.data });
}

export function updateSession(id: string, patch: Partial<Session>): Session | undefined {
  const s = sessions.get(id);
  if (!s) return undefined;
  Object.assign(s, patch);
  return s;
}

export function endSession(id: string): Session | undefined {
  return updateSession(id, { endedAt: Date.now() });
}
