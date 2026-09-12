/**
 * In-memory pub/sub for table SSE streams, keyed by 4-digit table code.
 * Each subscriber declares who it is (a seated player or the rail) so the publisher can filter
 * events per viewer: private hole cards, tell visibility.
 * Lives on globalThis so it survives Next.js dev HMR. Requires a single Node process (Railway), not serverless.
 */

import type { TableEvent, Viewer } from "@/lib/types";

type Send = (event: TableEvent) => void;

interface Subscriber {
  viewer: Viewer;
  send: Send;
}

const g = globalThis as unknown as { __tableBus?: Map<string, Set<Subscriber>> };
const channels = (g.__tableBus ??= new Map<string, Set<Subscriber>>());

export function openChannel(code: string): void {
  if (!channels.has(code)) channels.set(code, new Set());
}

export function hasChannel(code: string): boolean {
  return channels.has(code);
}

/** Publish an event, or a per-viewer factory returning null to skip that viewer. */
export function publish(code: string, event: TableEvent | ((viewer: Viewer) => TableEvent | null)): void {
  const subs = channels.get(code);
  if (!subs) return;
  for (const s of subs) {
    const ev = typeof event === "function" ? event(s.viewer) : event;
    if (!ev) continue;
    try {
      s.send(ev);
    } catch {
      subs.delete(s);
    }
  }
}

export function subscribe(code: string, viewer: Viewer, send: Send): (() => void) | null {
  const subs = channels.get(code);
  if (!subs) return null;
  const sub: Subscriber = { viewer, send };
  subs.add(sub);
  return () => subs.delete(sub);
}

/** Number of live connections for a player (0 = disconnected). */
export function connections(code: string, playerId: string): number {
  let n = 0;
  for (const s of channels.get(code) ?? []) if (s.viewer.kind === "player" && s.viewer.playerId === playerId) n++;
  return n;
}

export function closeChannel(code: string): void {
  publish(code, { type: "ended", code });
  channels.delete(code);
}
