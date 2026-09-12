/**
 * In-memory pub/sub for the Rail (spectator) SSE streams, keyed by 4-digit code.
 * Lives on globalThis so it survives Next.js dev HMR. Requires a single Node process (Railway), not serverless.
 */

import type { RailEvent } from "@/lib/types";

type Subscriber = (event: RailEvent) => void;

interface Channel {
  subscribers: Set<Subscriber>;
  lastByType: Map<RailEvent["type"], RailEvent>;
  sessionId: string;
  createdAt: number;
}

const g = globalThis as unknown as { __railBus?: Map<string, Channel> };
const channels = (g.__railBus ??= new Map<string, Channel>());

export function openChannel(code: string, sessionId: string): void {
  channels.set(code, { subscribers: new Set(), lastByType: new Map(), sessionId, createdAt: Date.now() });
}

export function hasChannel(code: string): boolean {
  return channels.has(code);
}

export function publish(code: string, event: RailEvent): boolean {
  const ch = channels.get(code);
  if (!ch) return false;
  ch.lastByType.set(event.type, event);
  for (const s of ch.subscribers) s(event);
  return true;
}

/** Subscribe and immediately replay the last event of each type so late joiners see current state. */
export function subscribe(code: string, sub: Subscriber): (() => void) | null {
  const ch = channels.get(code);
  if (!ch) return null;
  ch.subscribers.add(sub);
  for (const ev of ch.lastByType.values()) sub(ev);
  return () => ch.subscribers.delete(sub);
}

export function closeChannel(code: string): void {
  const ch = channels.get(code);
  if (!ch) return;
  publish(code, { type: "ended", sessionId: ch.sessionId });
  channels.delete(code);
}
