/**
 * Server-owned table: lobby, seating, hand loop, AI turns, turn timer, tells, per-viewer views, log.
 *
 * One Table per 4-letter code, kept on globalThis (single Node process). Clients never see the deck or
 * other players' hole cards until showdown. `drive()` advances the table until a human must act, then
 * stops; a human action (or the turn timer) calls it again.
 */

import "server-only";
import type { ActionRequest } from "@/lib/poker/engine";
import { applyAction, bounds, dealtSeats, legalActions, liveSeats, newHand, nextSeat, positionLabel, publicHand } from "@/lib/poker/engine";
import { monteCarloEquity, potOdds } from "@/lib/poker/equity";
import { decide } from "@/lib/villain/brain";
import { getProfile, resolveProfile } from "@/lib/villain/profile";
import { pickVoice } from "@/lib/villain/voices";
import { isSeatableModelId } from "@/lib/llm/models";
import { tellAudiences } from "@/lib/tells/visibility";
import { appendLog, createLog, endLog, getLog, setBaseline, syncLogPlayers } from "@/lib/store";
import { buildReveal } from "@/lib/game/reveal";
import { recordHall } from "@/lib/hall";
import { actionKey, showdownNotes, type ActionTells } from "./notes";
import { closeChannel, connections, hasChannel, openChannel, publish } from "@/lib/realtime/bus";
import { generateCode } from "@/lib/rail/code";
import { aiGuestList } from "@/lib/game/rematch";
import {
  DEFAULT_TABLE,
  type ActionBounds,
  type ActionType,
  type BaselineStats,
  type HallEntry,
  type HandState,
  type OpponentView,
  type Player,
  type PlayerStats,
  type PlayerTells,
  type TableConfig,
  type TableEvent,
  type TableLog,
  type TableState,
  type Action,
  type ShowdownNote,
  type TableListing,
  type TellFrame,
  type TellVector,
  type Viewer,
} from "@/lib/types";

// Demo pace: a four-minute session should fit three or four hands.
const HAND_END_PAUSE_MS = 3500;
const AI_THINK_MS: [number, number] = [600, 1400];
const DISCONNECTED_TURN_MS = 12_000;
const FINISHED_CHANNEL_MS = 10 * 60_000;

interface Table {
  code: string;
  config: TableConfig;
  phase: TableState["phase"];
  hostId: string;
  players: Player[];
  tokens: Map<string, string>; // token -> playerId
  hand: HandState | null;
  handNumber: number;
  button: number;
  tells: Record<string, PlayerTells>;
  /** Per player tendencies over the match. */
  stats: Record<string, PlayerStats>;
  /** Showdown facts about the humans this match, oldest first. See notes.ts. */
  notes: ShowdownNote[];
  /** Players who already counted VPIP/PFR this hand. */
  vpipThisHand: Set<string>;
  pfrThisHand: Set<string>;
  /** Per AI player: table-talk lines already spoken, for the no-repeat prompt. */
  saidLines: Record<string, string[]>;
  turnDeadline?: number;
  turnTimer?: ReturnType<typeof setTimeout>;
  driving: boolean;
  createdAt: number;
  standings?: TableState["standings"];
  /** The table this one was rematched into, so a repeat request returns the same new code. */
  rematch?: Promise<{ code: string; playerId: string; token: string }>;
}

const g = globalThis as unknown as { __tables?: Map<string, Table> };
const tables = (g.__tables ??= new Map<string, Table>());

/** Tables anyone can watch right now: in play first, then lobbies filling up; newest first within each. */
export function listOpenTables(limit = 24): TableListing[] {
  const order: Record<string, number> = { playing: 0, lobby: 1 };
  return [...tables.values()]
    .filter((t) => t.phase === "playing" || t.phase === "lobby")
    .sort((a, b) => order[a.phase] - order[b.phase] || b.createdAt - a.createdAt)
    .slice(0, limit)
    .map((t) => ({
      code: t.code,
      phase: t.phase,
      handNumber: t.handNumber,
      handsPerMatch: t.config.handsPerMatch,
      humans: t.players.filter((p) => p.kind === "human").map((p) => p.name),
      ais: t.players.filter((p) => p.kind === "ai").map((p) => p.name),
      createdAt: t.createdAt,
    }));
}

export class TableError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

// ---------- lobby ----------

export async function createTable(configPatch: Partial<TableConfig>, hostName: string): Promise<{ code: string; playerId: string; token: string }> {
  const config = sanitizeConfig({ ...DEFAULT_TABLE, ...configPatch });
  const code = generateCode((c) => tables.has(c));
  const hostId = crypto.randomUUID();
  const token = crypto.randomUUID();
  const t: Table = {
    code,
    config,
    phase: "lobby",
    hostId,
    players: [{ id: hostId, seat: 0, name: cleanName(hostName, "Host"), kind: "human", stack: config.startingStack, connected: false, sittingOut: false }],
    tokens: new Map([[token, hostId]]),
    hand: null,
    handNumber: 0,
    button: 0,
    tells: {},
    stats: {},
    notes: [],
    vpipThisHand: new Set(),
    pfrThisHand: new Set(),
    saidLines: {},
    driving: false,
    createdAt: Date.now(),
  };
  tables.set(code, t);
  openChannel(code);
  for (const modelId of config.aiPlayers) await seatAI(t, modelId);
  createLog(code, config, t.players);
  return { code, playerId: hostId, token };
}

export function joinTable(code: string, name: string): { playerId: string; token: string } {
  const t = must(code);
  if (t.phase === "finished") throw new TableError("This table has finished", 410);
  if (t.phase === "playing" && !t.config.allowLateJoin) throw new TableError("Table is already playing and does not allow late joins", 409);
  const seat = freeSeat(t);
  if (seat === null) throw new TableError("Table is full", 409);
  const playerId = crypto.randomUUID();
  const token = crypto.randomUUID();
  t.players.push({ id: playerId, seat, name: cleanName(name, `Player ${seat + 1}`), kind: "human", stack: t.config.startingStack, connected: false, sittingOut: false });
  t.tokens.set(token, playerId);
  syncLogPlayers(code, t.players);
  broadcastState(t);
  return { playerId, token };
}

export async function addAI(code: string, token: string, modelId: string): Promise<void> {
  const t = must(code);
  requireHost(t, token);
  if (t.phase !== "lobby") throw new TableError("AI players can only be added in the lobby");
  if (!isSeatableModelId(modelId)) throw new TableError(`Not an OpenRouter model id: ${modelId}`);
  if (freeSeat(t) === null) throw new TableError("Table is full", 409);
  await seatAI(t, modelId);
  syncLogPlayers(code, t.players);
  broadcastState(t);
}

export function removePlayer(code: string, token: string, playerId: string): void {
  const t = must(code);
  requireHost(t, token);
  if (t.phase !== "lobby") throw new TableError("Players can only be removed in the lobby");
  if (playerId === t.hostId) throw new TableError("The host cannot be removed");
  t.players = t.players.filter((p) => p.id !== playerId);
  for (const [tok, pid] of t.tokens) if (pid === playerId) t.tokens.delete(tok);
  syncLogPlayers(code, t.players);
  broadcastState(t);
}

export function updateConfig(code: string, token: string, patch: Partial<TableConfig>): void {
  const t = must(code);
  requireHost(t, token);
  if (t.phase !== "lobby") throw new TableError("Config can only change in the lobby");
  const next = sanitizeConfig({ ...t.config, ...patch, aiPlayers: t.config.aiPlayers });
  if (next.maxSeats < t.players.length) throw new TableError(`${t.players.length} players are seated; cannot shrink to ${next.maxSeats} seats`);
  t.config = next;
  for (const p of t.players) p.stack = next.startingStack;
  const log = getLog(code);
  if (log) log.config = next;
  broadcastState(t);
}

export function startTable(code: string, token: string): void {
  const t = must(code);
  requireHost(t, token);
  if (t.phase !== "lobby") throw new TableError("Table already started");
  if (t.players.length < 2) throw new TableError("Need at least two players");
  t.phase = "playing";
  appendLog(code, "table_start", { config: t.config, players: t.players });
  broadcastState(t);
  void drive(t);
}

export function leaveTable(code: string, token: string): void {
  const t = must(code);
  const me = playerByToken(t, token);
  if (t.phase === "lobby") {
    if (me.id === t.hostId) {
      finishTable(t, "host left");
      return;
    }
    t.players = t.players.filter((p) => p.id !== me.id);
    t.tokens.delete(token);
    syncLogPlayers(code, t.players);
    broadcastState(t);
    return;
  }
  me.sittingOut = true;
  if (t.hand && !t.hand.over && t.hand.toAct === me.seat) {
    autoAct(t, me.seat);
    void drive(t);
  } else broadcastState(t);
}

/** Host ends the match now. A hand in progress is voided: everyone gets their chips back. */
export function endTable(code: string, token: string): void {
  const t = must(code);
  requireHost(t, token);
  if (t.phase !== "playing") throw new TableError("No match in progress");
  clearTurnTimer(t);
  if (t.hand && !t.hand.over) {
    for (const p of t.players) {
      const seat = t.hand.seats[p.seat];
      if (seat && seat.playerId === p.id) p.stack = seat.stack + seat.totalIn;
    }
    appendLog(t.code, "hand_end", { handNumber: t.hand.handNumber, voided: true, reason: "host ended the match" });
    t.hand = null;
  }
  finishTable(t, "host ended the match");
}

/**
 * Host reopens a finished table at a fresh code: same config, same AI guests in the same seat order
 * (duplicates included). Anyone still on the old table's stream is told the new code. A repeat call
 * returns the same new table while it is open, so a double click or a retry cannot open two.
 */
export async function rematchTable(code: string, token: string): Promise<{ code: string; playerId: string; token: string }> {
  const t = must(code);
  requireHost(t, token);
  if (t.phase !== "finished") throw new TableError("The match has not finished yet");
  const prev = t.rematch ? await t.rematch.catch(() => null) : null;
  const open = prev ? tables.get(prev.code) : undefined;
  if (prev && open && open.phase !== "finished") {
    publish(t.code, { type: "rematch", code: prev.code });
    return prev;
  }
  const host = playerByToken(t, token);
  t.rematch = createTable({ ...t.config, aiPlayers: aiGuestList(t.players) }, host.name);
  const next = await t.rematch;
  publish(t.code, { type: "rematch", code: next.code });
  return next;
}

// ---------- play ----------

export function act(code: string, token: string, req: Omit<ActionRequest, "seat">, tells: TellVector | null): void {
  const t = must(code);
  const me = playerByToken(t, token);
  if (t.phase !== "playing" || !t.hand || t.hand.over) throw new TableError("No hand in progress");
  if (t.hand.toAct !== me.seat) throw new TableError("Not your turn");
  // The fused read for this decision is the freshest tell data; the AIs use it on their next turn. A new decision
  // supersedes the post-bet read of the previous one; the client sends a fresh one a few seconds after a bet.
  if (tells) t.tells[me.id] = { frame: t.tells[me.id]?.frame ?? null, vector: tells, after: null, live: t.tells[me.id]?.live ?? null, at: Date.now() };
  // Apply before clearing the timer: an illegal action (stale slider bounds) throws here and the turn timer must
  // stay armed, or the hand hangs on a player who never gets auto-folded.
  applyAndPublish(t, { ...req, seat: me.seat }, tells);
  clearTurnTimer(t);
  void drive(t);
}

export function updateTells(code: string, token: string, input: { frame?: TellFrame | null; vector?: TellVector | null; after?: TellVector | null; live?: TellVector | null; baseline?: BaselineStats }): void {
  const t = must(code);
  const me = playerByToken(t, token);
  if (input.baseline) setBaseline(code, me.id, input.baseline);
  if (input.frame === undefined && input.vector === undefined && input.after === undefined && input.live === undefined) return;
  const prev = t.tells[me.id];
  // For each read, an explicit null clears it (the client sends one once a new hand starts); undefined keeps it.
  const keep = <T,>(next: T | null | undefined, old: T | null | undefined): T | null => (next !== undefined ? next : (old ?? null));
  const tells: PlayerTells = {
    frame: input.frame ?? prev?.frame ?? null,
    vector: keep(input.vector, prev?.vector),
    after: keep(input.after, prev?.after),
    live: keep(input.live, prev?.live),
    at: Date.now(),
  };
  t.tells[me.id] = tells;
  publish(code, (viewer) => (tellsVisibleTo(t, viewer, me.id) ? { type: "tells", playerId: me.id, tells } : null));
}

export function setConnected(code: string, playerId: string): void {
  const t = tables.get(code);
  const p = t?.players.find((x) => x.id === playerId);
  if (!t || !p) return;
  const now = connections(code, playerId) > 0;
  if (p.connected === now) return;
  p.connected = now;
  broadcastState(t);
}

// ---------- views ----------

export function resolveViewer(code: string, token: string | null): Viewer {
  const t = must(code);
  if (!token) return { kind: "rail" };
  const pid = t.tokens.get(token);
  if (!pid) throw new TableError("Bad token", 401);
  return { kind: "player", playerId: pid };
}

export function getState(code: string, viewer: Viewer): TableState {
  return toState(must(code), viewer);
}

export function tableExists(code: string): boolean {
  return tables.has(code) && hasChannel(code);
}

export function getTableLog(code: string): TableLog | undefined {
  return getLog(code);
}

/** Tells this viewer is allowed to see right now (replayed to late joiners). */
export function visibleTells(code: string, viewer: Viewer): Record<string, PlayerTells> {
  const t = must(code);
  const out: Record<string, PlayerTells> = {};
  for (const [pid, tells] of Object.entries(t.tells)) if (tellsVisibleTo(t, viewer, pid)) out[pid] = tells;
  return out;
}

function tellsVisibleTo(t: Table, viewer: Viewer, ownerId: string): boolean {
  const audiences = tellAudiences(t.config.tellVisibility);
  if (viewer.kind === "rail") return audiences.rail;
  if (viewer.playerId === ownerId) return false; // own HUD is local
  return audiences.humans;
}

function toState(t: Table, viewer: Viewer): TableState {
  const seat = viewer.kind === "player" ? (t.players.find((p) => p.id === viewer.playerId)?.seat ?? -1) : "all";
  return {
    code: t.code,
    config: t.config,
    phase: t.phase,
    hostId: t.hostId,
    players: t.players,
    hand: t.hand ? publicHand(t.hand, seat) : null,
    handNumber: t.handNumber,
    turnDeadline: t.turnDeadline,
    createdAt: t.createdAt,
    standings: t.standings,
  };
}

function broadcastState(t: Table) {
  publish(t.code, (viewer) => ({ type: "state", state: toState(t, viewer) }));
}

// ---------- internals ----------

function must(code: string): Table {
  const t = tables.get(code);
  if (!t) throw new TableError("No such table", 404);
  return t;
}

function playerByToken(t: Table, token: string): Player {
  const pid = t.tokens.get(token);
  const p = pid ? t.players.find((x) => x.id === pid) : undefined;
  if (!p) throw new TableError("Bad token", 401);
  return p;
}

function requireHost(t: Table, token: string) {
  if (t.tokens.get(token) !== t.hostId) throw new TableError("Host only", 403);
}

function freeSeat(t: Table): number | null {
  const taken = new Set(t.players.map((p) => p.seat));
  for (let i = 0; i < t.config.maxSeats; i++) if (!taken.has(i)) return i;
  return null;
}

async function seatAI(t: Table, modelId: string) {
  const seat = freeSeat(t);
  if (seat === null || !isSeatableModelId(modelId)) return;
  const profile = await resolveProfile(modelId);
  const dupes = t.players.filter((p) => p.modelId === modelId).length;
  const voiceId = pickVoice(modelId, profile.vendor, t.players.map((p) => p.voiceId).filter((v): v is string => !!v));
  t.players.push({
    id: `ai-${crypto.randomUUID().slice(0, 8)}`,
    seat,
    name: dupes ? `${profile.name} ${dupes + 1}` : profile.name,
    kind: "ai",
    modelId,
    voiceId,
    stack: t.config.startingStack,
    connected: true,
    sittingOut: false,
  });
}

function cleanName(name: string, fallback: string): string {
  const n = (name ?? "").trim().slice(0, 20);
  return n || fallback;
}

function sanitizeConfig(c: TableConfig): TableConfig {
  const int = (v: unknown, lo: number, hi: number, def: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
  };
  const vis: TableConfig["tellVisibility"][] = ["ai_and_rail", "ai_and_humans", "rail_and_humans", "everyone", "ai_only", "rail_only", "human_only", "off"];
  const smallBlind = int(c.smallBlind, 1, 1_000_000, DEFAULT_TABLE.smallBlind);
  return {
    maxSeats: int(c.maxSeats, 2, 9, DEFAULT_TABLE.maxSeats),
    startingStack: int(c.startingStack, 2, 100_000_000, DEFAULT_TABLE.startingStack),
    smallBlind,
    bigBlind: Math.max(smallBlind, int(c.bigBlind, 1, 2_000_000, DEFAULT_TABLE.bigBlind)),
    handsPerMatch: int(c.handsPerMatch, 0, 1000, DEFAULT_TABLE.handsPerMatch),
    turnTimerSec: int(c.turnTimerSec, 0, 120, DEFAULT_TABLE.turnTimerSec),
    tellVisibility: vis.includes(c.tellVisibility) ? c.tellVisibility : DEFAULT_TABLE.tellVisibility,
    aiPlayers: Array.isArray(c.aiPlayers) ? c.aiPlayers.filter((x) => typeof x === "string" && isSeatableModelId(x)).slice(0, 8) : DEFAULT_TABLE.aiPlayers,
    allowLateJoin: c.allowLateJoin !== false,
    voice: c.voice !== false,
  };
}

function playerAtSeat(t: Table, seat: number): Player | undefined {
  return t.players.find((p) => p.seat === seat);
}

/** Advance the table until a human must act or the table finishes. Re-entrant safe via `driving`. */
async function drive(t: Table): Promise<void> {
  if (t.driving) return;
  t.driving = true;
  try {
    while (t.phase === "playing") {
      if (!t.hand || t.hand.over) {
        if (t.hand?.over) await sleep(HAND_END_PAUSE_MS);
        if (t.phase !== "playing") break;
        if (!dealNext(t)) break;
        continue;
      }
      const seat = t.hand.toAct;
      if (seat === null) break; // engine settles hands with no action left; should not happen
      const player = playerAtSeat(t, seat);
      if (!player || player.sittingOut) {
        autoAct(t, seat);
        continue;
      }
      if (player.kind === "ai") {
        await sleep(AI_THINK_MS[0] + Math.random() * (AI_THINK_MS[1] - AI_THINK_MS[0]));
        if (t.phase !== "playing" || !t.hand || t.hand.over || t.hand.toAct !== seat) continue;
        await aiAct(t, seat);
        continue;
      }
      armTurnTimer(t, player);
      break;
    }
  } finally {
    t.driving = false;
  }
}

/** Deal the next hand. Returns false (and finishes the table) when the match is over. */
function dealNext(t: Table): boolean {
  const eligible = t.players.filter((p) => !p.sittingOut && p.stack > 0);
  const withChips = t.players.filter((p) => p.stack > 0);
  if (t.config.handsPerMatch > 0 && t.handNumber >= t.config.handsPerMatch) return finishTable(t, "hand limit reached");
  if (withChips.length < 2) return finishTable(t, "one player has all the chips");
  if (eligible.length < 2) return finishTable(t, "not enough players seated");

  const seats = Array.from({ length: t.config.maxSeats }, (_, i) => {
    const p = eligible.find((x) => x.seat === i);
    return p ? { playerId: p.id, stack: p.stack } : null;
  });
  const button = t.handNumber === 0 && seats[t.button] ? t.button : nextSeat({ seats }, t.button)!;
  t.handNumber += 1;
  t.button = button;
  t.hand = newHand(t.handNumber, seats, button, t.config);
  t.turnDeadline = undefined;
  // A fused read belongs to the decision it was taken on. Without this the AIs' first decision of the new hand
  // would cite last hand's snap-fold as if it were happening now.
  for (const [pid, tells] of Object.entries(t.tells)) {
    if (!tells.vector && !tells.after && !tells.live) continue;
    const cleared: PlayerTells = { ...tells, vector: null, after: null, live: null, at: Date.now() };
    t.tells[pid] = cleared;
    publish(t.code, (viewer) => (tellsVisibleTo(t, viewer, pid) ? { type: "tells", playerId: pid, tells: cleared } : null));
  }
  t.vpipThisHand = new Set();
  t.pfrThisHand = new Set();
  for (const p of eligible) statsFor(t, p.id).hands++;
  appendLog(t.code, "hand_start", {
    handNumber: t.handNumber,
    button,
    seats: t.hand.seats.map((s, i) => (s ? { seat: i, playerId: s.playerId, stack: s.stack + s.totalIn, holeCards: s.holeCards } : null)).filter(Boolean),
  });
  broadcastState(t);
  if (t.hand.over) settleHand(t);
  return true;
}

function applyAndPublish(t: Table, req: ActionRequest, tells: TellVector | null) {
  if (!t.hand) return;
  t.hand = applyAction(t.hand, req, t.config);
  const action = t.hand.actions[t.hand.actions.length - 1];
  const player = playerAtSeat(t, req.seat);
  if (player) recordStats(t, player.id, action.type, action.street);
  appendLog(t.code, "action", { handNumber: t.hand.handNumber, playerId: player?.id, action, tells });
  if (tells && player) appendLog(t.code, "tells", { handNumber: t.hand.handNumber, street: action.street, playerId: player.id, tells });
  t.turnDeadline = undefined;
  publish(t.code, { type: "action", action, playerId: player?.id ?? "" });
  broadcastState(t);
  if (t.hand.over) settleHand(t);
}

function statsFor(t: Table, playerId: string): PlayerStats {
  return (t.stats[playerId] ??= { hands: 0, vpip: 0, pfr: 0, aggressive: 0, calls: 0, showdownsWon: 0, showdowns: 0 });
}

function recordStats(t: Table, playerId: string, type: ActionType, street: string) {
  const st = statsFor(t, playerId);
  if (type === "call" || type === "bet" || type === "raise" || type === "allin") {
    if (street === "preflop" && !t.vpipThisHand.has(playerId)) { t.vpipThisHand.add(playerId); st.vpip++; }
  }
  if (type === "bet" || type === "raise" || type === "allin") {
    st.aggressive++;
    if (street === "preflop" && !t.pfrThisHand.has(playerId)) { t.pfrThisHand.add(playerId); st.pfr++; }
  }
  if (type === "call") st.calls++;
}

function settleHand(t: Table) {
  const hand = t.hand;
  if (!hand || !hand.over) return;
  if (!hand.foldedOut) {
    for (const r of hand.results ?? []) {
      const p = playerAtSeat(t, r.seat);
      if (!p) continue;
      const st = statsFor(t, p.id);
      st.showdowns++;
      if (r.won > 0) st.showdownsWon++;
    }
    // The notebook: every bet a human made this hand, now that we know what they held. Never let it break settling.
    try {
      const tells: ActionTells = new Map();
      for (const e of getLog(t.code)?.entries ?? []) {
        if (e.kind !== "action") continue;
        const d = e.data as { handNumber: number; action: Action; tells: TellVector | null };
        if (d.handNumber === hand.handNumber) tells.set(actionKey(d.action), d.tells);
      }
      const fresh = showdownNotes(hand, t.players, tells);
      for (const n of fresh) appendLog(t.code, "showdown_note", n);
      t.notes = [...t.notes, ...fresh].slice(-60);
    } catch (err) {
      console.error("notebook: could not write showdown notes for", t.code, err);
    }
  }
  for (const p of t.players) {
    const s = hand.seats[p.seat];
    if (s && s.playerId === p.id) p.stack = s.stack;
  }
  syncLogPlayers(t.code, t.players);
  appendLog(t.code, "hand_end", {
    handNumber: hand.handNumber,
    board: hand.board,
    pots: hand.pots,
    results: hand.results,
    foldedOut: hand.foldedOut,
    stacks: t.players.map((p) => ({ playerId: p.id, stack: p.stack })),
  });
  publish(t.code, { type: "hand_end", hand: publicHand(hand, "all") });
  broadcastState(t);
}

async function aiAct(t: Table, seat: number) {
  const hand = t.hand!;
  const me = hand.seats[seat]!;
  const player = playerAtSeat(t, seat)!;
  const legal = legalActions(hand, seat, t.config);
  const b: ActionBounds = bounds(hand, seat, t.config);
  const liveOpp = liveSeats(hand).filter((i) => i !== seat);
  const live = liveOpp.length;
  const preflopOf = (i: number): NonNullable<OpponentView["preflop"]> => {
    const acts = hand.actions.filter((a) => a.seat === i && a.street === "preflop");
    if (!acts.length) return "none";
    if (acts.some((a) => a.type === "raise" || a.type === "bet" || a.type === "allin")) return "raised";
    if (acts.some((a) => a.type === "call")) return hand.actions.some((a) => a.street === "preflop" && (a.type === "raise" || a.type === "bet")) ? "called" : "limped";
    return "checked";
  };
  // Range estimate per live opponent from their preflop line: raisers are tight, callers medium, limpers/checkers wide.
  const rangeOf = (i: number) => ({ raised: 0.18, called: 0.35, limped: 0.55, checked: 1, none: 1 })[preflopOf(i)];
  const eq = monteCarloEquity(me.holeCards, hand.board, live, live > 2 ? 800 : 1200, undefined, liveOpp.map(rangeOf));
  const lastAggressorPrev = [...hand.actions].reverse().find((a) => a.street !== hand.street && (a.type === "bet" || a.type === "raise" || a.type === "allin"));
  const hasInitiative = hand.street !== "preflop" && lastAggressorPrev?.seat === seat && lastAggressorPrev.street === { flop: "preflop", turn: "flop", river: "turn" }[hand.street as "flop" | "turn" | "river"];
  const raisesThisStreet = hand.actions.filter((a) => a.street === hand.street && (a.type === "raise" || a.type === "bet" || a.type === "allin")).length;
  const tellsOn = tellAudiences(t.config.tellVisibility).ai;
  const names: Record<number, string> = {};
  for (const p of t.players) names[p.seat] = p.name;
  const opponents: OpponentView[] = dealtSeats(hand)
    .filter((i) => i !== seat)
    .map((i) => {
      const s = hand.seats[i]!;
      const p = playerAtSeat(t, i);
      return {
        seat: i,
        id: p?.id,
        name: p?.name ?? `Seat ${i + 1}`,
        kind: p?.kind ?? "human",
        stack: s.stack,
        committed: s.committed,
        folded: s.folded,
        allIn: s.allIn,
        position: positionLabel(hand, i),
        tells: tellsOn && p?.kind === "human" ? (t.tells[p.id]?.vector ?? null) : null,
        after: tellsOn && p?.kind === "human" ? (t.tells[p.id]?.after ?? null) : null,
        stats: p ? t.stats[p.id] : undefined,
        preflop: preflopOf(i),
      };
    });

  const decision = await decide({
    hand: { handNumber: hand.handNumber, street: hand.street, board: hand.board, pot: hand.pot, currentBet: hand.currentBet, minRaise: hand.minRaise, actions: hand.actions },
    me: { seat, holeCards: me.holeCards, stack: me.stack, committed: me.committed, position: positionLabel(hand, seat) },
    opponents,
    names,
    legalActions: legal,
    bounds: b,
    equity: eq.equity,
    potOdds: potOdds(b.toCall, hand.pot),
    bigBlind: t.config.bigBlind,
    hasInitiative,
    raisesThisStreet,
    modelId: player.modelId ?? DEFAULT_TABLE.aiPlayers[0],
    recentTalk: (t.saidLines[player.id] ?? []).slice(-4),
    notes: t.notes,
    meId: player.id,
  });

  // The table may have moved on while the LLM was thinking (e.g. host ended it).
  if (t.phase !== "playing" || t.hand !== hand) return;

  let req: ActionRequest = { seat, type: decision.action, amount: decision.amount };
  try {
    if (!legal.includes(req.type)) throw new Error("illegal");
    if ((req.type === "bet" || req.type === "raise") && (req.amount === undefined || req.amount < b.minTotal || req.amount > b.maxTotal)) req.amount = b.minTotal;
    applyAction(hand, req, t.config); // dry run
  } catch {
    const fallback: ActionType = legal.includes("check") ? "check" : legal.includes("call") ? "call" : "fold";
    req = { seat, type: fallback };
    decision.action = fallback;
    decision.amount = undefined;
  }

  appendLog(t.code, "ai_decision", {
    handNumber: hand.handNumber,
    street: hand.street,
    playerId: player.id,
    equity: eq.equity,
    opponents,
    decision,
    situation: {
      board: [...hand.board],
      pot: hand.pot,
      currentBet: hand.currentBet,
      toCall: b.toCall,
      aiSeat: seat,
      aiStack: me.stack,
      aiCommitted: me.committed,
      aiPosition: positionLabel(hand, seat),
      aiHoleCards: [...me.holeCards],
      actions: hand.actions.map((action) => ({ ...action })),
    },
  });
  publish(t.code, { type: "ai_decision", playerId: player.id, decision, handNumber: hand.handNumber, street: hand.street });
  applyAndPublish(t, req, null);
  if (decision.tableTalk) {
    const said = (t.saidLines[player.id] ??= []);
    // Drop an exact repeat rather than say it twice; the prompt already asks the model not to.
    if (said.some((l) => l.trim().toLowerCase() === decision.tableTalk.trim().toLowerCase())) decision.tableTalk = "";
    else said.push(decision.tableTalk);
  }
  if (decision.tableTalk) {
    appendLog(t.code, "talk", { handNumber: hand.handNumber, playerId: player.id, text: decision.tableTalk });
    const talk: TableEvent = { type: "talk", playerId: player.id, text: decision.tableTalk, voiceId: player.voiceId ?? getProfile(player.modelId ?? DEFAULT_TABLE.aiPlayers[0]).voiceId };
    publish(t.code, talk);
  }
}

/** Check if possible, otherwise fold. Used by the turn timer, sitting-out players, and orphaned seats. */
function autoAct(t: Table, seat: number) {
  if (!t.hand || t.hand.over || t.hand.toAct !== seat) return;
  const legal = legalActions(t.hand, seat, t.config);
  const type: ActionType = legal.includes("check") ? "check" : "fold";
  clearTurnTimer(t);
  applyAndPublish(t, { seat, type }, null);
}

function armTurnTimer(t: Table, player: Player) {
  clearTurnTimer(t);
  const ms = t.config.turnTimerSec > 0 ? t.config.turnTimerSec * 1000 : player.connected ? 0 : DISCONNECTED_TURN_MS;
  if (!ms) {
    t.turnDeadline = undefined;
    broadcastState(t);
    return;
  }
  t.turnDeadline = Date.now() + ms;
  const seat = player.seat;
  t.turnTimer = setTimeout(() => {
    t.turnTimer = undefined;
    if (t.hand && !t.hand.over && t.hand.toAct === seat) {
      autoAct(t, seat);
      void drive(t);
    }
  }, ms);
  broadcastState(t);
}

function clearTurnTimer(t: Table) {
  if (t.turnTimer) clearTimeout(t.turnTimer);
  t.turnTimer = undefined;
}

function finishTable(t: Table, reason: string): false {
  clearTurnTimer(t);
  t.phase = "finished";
  t.hand = t.hand && t.hand.over ? t.hand : null;
  t.standings = [...t.players]
    .sort((a, b) => b.stack - a.stack)
    .map((p) => ({ playerId: p.id, name: p.name, stack: p.stack, net: p.stack - t.config.startingStack }));
  appendLog(t.code, "table_end", { reason, standings: t.standings });
  endLog(t.code);
  syncLogPlayers(t.code, t.players);
  broadcastState(t);
  // Hall of Poker Faces: grade the humans now that the log is complete. Never let this break finishing.
  try {
    const log = getLog(t.code);
    if (log) {
      const data = buildReveal(log);
      const talk = log.entries.filter((e) => e.kind === "talk").map((e) => String((e.data as { text?: unknown }).text ?? ""));
      const entries: HallEntry[] = [];
      for (const h of data.humans) {
        if (h.pokerFace === null) continue;
        const bluffs = h.decisions.filter((d) => d.isBluff);
        const needle = h.player.name.toLowerCase();
        entries.push({
          name: h.player.name,
          code: t.code,
          pokerFace: h.pokerFace,
          bluffs: bluffs.length,
          bluffsCaught: bluffs.filter((d) => (d.tells?.bluffLikelihood ?? 0) >= 0.5).length,
          readsRight: h.readsRight,
          readsTotal: h.readsTotal,
          bestLine: talk.find((line) => line.toLowerCase().includes(needle)),
          at: log.endedAt ?? Date.now(),
        });
      }
      recordHall(entries);
    }
  } catch (err) {
    console.error("hall: could not record results for", t.code, err);
  }
  // Keep the finished table's stream open long enough for a rematch link to reach everyone and for the rail
  // to linger on the final state; the log and the reveal outlive the channel.
  setTimeout(() => closeChannel(t.code), FINISHED_CHANNEL_MS);
  return false;
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
