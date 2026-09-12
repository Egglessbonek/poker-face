/**
 * In-memory per-table log (globalThis-backed). Feeds the Reveal.
 * Single-process deployment only. Swap for Redis if multi-instance is ever needed.
 */

import type { BaselineStats, Player, TableConfig, TableLog, TableLogEntry, TableLogKind } from "@/lib/types";

const g = globalThis as unknown as { __tableLogs?: Map<string, TableLog> };
const logs = (g.__tableLogs ??= new Map<string, TableLog>());

export function createLog(code: string, config: TableConfig, players: Player[]): TableLog {
  const log: TableLog = { code, createdAt: Date.now(), config, players, baselines: {}, entries: [] };
  logs.set(code, log);
  return log;
}

export function getLog(code: string): TableLog | undefined {
  return logs.get(code);
}

export function appendLog(code: string, kind: TableLogKind, data: unknown): void {
  const log = logs.get(code);
  if (!log) return;
  log.entries.push({ t: Date.now(), kind, data } satisfies TableLogEntry);
}

/** Keep the player roster in the log current (names, final stacks). */
export function syncLogPlayers(code: string, players: Player[]): void {
  const log = logs.get(code);
  if (log) log.players = players.map((p) => ({ ...p }));
}

export function setBaseline(code: string, playerId: string, baseline: BaselineStats): void {
  const log = logs.get(code);
  if (log) log.baselines[playerId] = baseline;
}

export function endLog(code: string): void {
  const log = logs.get(code);
  if (log) log.endedAt = Date.now();
}
