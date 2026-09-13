/**
 * N-player No-Limit Hold'em state machine (2-9 seats) with side pots.
 *
 * Pure functions over HandState (they return new objects; inputs are not mutated) so the same engine
 * runs on the client for display and on the server as the source of truth.
 *
 * Positions: heads-up, the button posts the small blind and acts first preflop. With 3+ players the
 * small blind is left of the button, the big blind next, and preflop action starts left of the big
 * blind. Postflop, the first active seat left of the button acts first.
 *
 * `pot` always equals the sum of every seat's `totalIn`. `Action.amount` for bet/raise/call/allin is
 * the seat's total committed on that street after the action.
 */

import { Hand } from "pokersolver";
import type { ActionBounds, ActionType, Card, HandResult, HandState, HandView, Pot, SeatState, Street } from "@/lib/types";
import { freshDeck, shuffle } from "./cards";

export interface BlindConfig {
  smallBlind: number;
  bigBlind: number;
}

export interface SeatInput {
  playerId: string;
  stack: number;
}

export interface ActionRequest {
  seat: number;
  type: ActionType;
  /** Total committed after the action, for bet/raise. Ignored for other types. */
  amount?: number;
  latencyMs?: number;
}

// ---------- seat iteration ----------

/** Indices of seats that were dealt into this hand. */
export function dealtSeats(state: Pick<HandState, "seats">): number[] {
  return state.seats.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
}

/** Seats still contesting the pot (not folded), including all-in players. */
export function liveSeats(state: Pick<HandState, "seats">): number[] {
  return dealtSeats(state).filter((i) => !state.seats[i]!.folded);
}

/** Seats that can still make a decision (not folded, not all-in). */
export function activeSeats(state: Pick<HandState, "seats">): number[] {
  return liveSeats(state).filter((i) => !state.seats[i]!.allIn);
}

/** Next seat after `from` (wrapping) that satisfies `ok`; null if none. */
export function nextSeat<T extends object = SeatState>(state: { seats: (T | null)[] }, from: number, ok: (s: T, i: number) => boolean = () => true): number | null {
  const n = state.seats.length;
  for (let step = 1; step <= n; step++) {
    const i = (from + step) % n;
    const s = state.seats[i];
    if (s && ok(s, i)) return i;
  }
  return null;
}

/** Position label for a seat relative to the button. */
export function positionLabel(state: Pick<HandState, "seats" | "button">, seat: number): string {
  const dealt = dealtSeats(state);
  if (dealt.length === 2) return seat === state.button ? "BTN/SB" : "BB";
  const order: number[] = [];
  let cur: number | null = state.button;
  for (let k = 0; k < dealt.length && cur !== null; k++) {
    order.push(cur);
    cur = nextSeat(state, cur);
  }
  const idx = order.indexOf(seat);
  if (idx === 0) return "BTN";
  if (idx === 1) return "SB";
  if (idx === 2) return "BB";
  if (idx === dealt.length - 1) return "CO";
  if (idx === dealt.length - 2 && dealt.length > 5) return "HJ";
  return idx === 3 ? "UTG" : `UTG+${idx - 3}`;
}

// ---------- hand lifecycle ----------

function clone(state: HandState): HandState {
  return {
    ...state,
    board: [...state.board],
    actions: [...state.actions],
    deck: [...state.deck],
    seats: state.seats.map((s) => (s ? { ...s, holeCards: [...s.holeCards] } : null)),
    pots: state.pots?.map((p) => ({ amount: p.amount, eligible: [...p.eligible] })),
    results: state.results?.map((r) => ({ ...r })),
  };
}

/**
 * Deal a new hand. `seats` is the full table (length = maxSeats); `null` or zero-stack entries are
 * not dealt in. `button` must be a dealt seat. At least two seats must be dealt.
 */
export function newHand(handNumber: number, seats: (SeatInput | null)[], button: number, config: BlindConfig, rng?: () => number): HandState {
  const deck = shuffle(freshDeck(), rng);
  const seatStates: (SeatState | null)[] = seats.map((s) =>
    s && s.stack > 0 ? { playerId: s.playerId, stack: s.stack, committed: 0, totalIn: 0, holeCards: [], folded: false, allIn: false, acted: false } : null,
  );
  const base = { seats: seatStates, button };
  const dealt = dealtSeats(base);
  if (dealt.length < 2) throw new Error("Need at least two players with chips");
  if (!seatStates[button]) throw new Error(`Button seat ${button} is not dealt in`);

  const headsUp = dealt.length === 2;
  const sbSeat = headsUp ? button : nextSeat(base, button)!;
  const bbSeat = nextSeat(base, sbSeat)!;

  // Deal two cards each, starting left of the button.
  let cur: number = nextSeat(base, button)!;
  for (let round = 0; round < 2; round++) {
    for (let k = 0; k < dealt.length; k++) {
      seatStates[cur]!.holeCards.push(deck.pop() as Card);
      cur = nextSeat(base, cur)!;
    }
  }

  const post = (seat: number, amount: number) => {
    const p = seatStates[seat]!;
    const a = Math.min(amount, p.stack);
    p.stack -= a;
    p.committed = a;
    p.totalIn = a;
    p.allIn = p.stack === 0;
  };
  post(sbSeat, config.smallBlind);
  post(bbSeat, config.bigBlind);

  const state: HandState = {
    handNumber,
    street: "preflop",
    board: [],
    pot: seatStates.reduce((a, s) => a + (s?.totalIn ?? 0), 0),
    seats: seatStates,
    button,
    toAct: null,
    currentBet: Math.max(...dealt.map((i) => seatStates[i]!.committed)),
    minRaise: config.bigBlind,
    lastAggressor: null,
    actions: [],
    deck,
    over: false,
  };

  // First to act preflop: heads-up the button (SB); otherwise left of the big blind.
  const first = headsUp ? sbSeat : nextSeat(state, bbSeat)!;
  state.toAct = firstActiveFrom(state, first);
  return settleIfNoActionLeft(state, config);
}

/** `from` itself if it can act, else the next seat that can; null if nobody can. */
function firstActiveFrom(state: HandState, from: number): number | null {
  const s = state.seats[from];
  if (s && !s.folded && !s.allIn) return from;
  return nextSeat(state, from, (x) => !x.folded && !x.allIn);
}

export function bounds(state: HandView, seat: number, config: BlindConfig): ActionBounds {
  const p = state.seats[seat];
  if (!p) return { toCall: 0, minTotal: 0, maxTotal: 0 };
  const toCall = Math.max(0, state.currentBet - p.committed);
  const maxTotal = p.stack + p.committed;
  const minTotal = state.currentBet === 0 ? Math.min(config.bigBlind, maxTotal) : Math.min(state.currentBet + state.minRaise, maxTotal);
  return { toCall, minTotal, maxTotal };
}

export function legalActions(state: HandView, seat: number, config: BlindConfig): ActionType[] {
  const p = state.seats[seat];
  if (!p || state.over || state.toAct !== seat || p.folded || p.allIn) return [];
  const { toCall, maxTotal } = bounds(state, seat, config);
  // Someone else must be able to respond for a bet/raise to mean anything.
  const responders = activeSeats(state).filter((i) => i !== seat).length;
  // House rule: an in-turn fold is binding even when checking is free.
  const acts: ActionType[] = ["fold"];
  if (toCall === 0) {
    acts.push("check");
    // Preflop the big blind's option is a raise (there is a live bet); otherwise it is a bet.
    if (p.stack > 0 && responders > 0) acts.push(state.currentBet > 0 ? "raise" : "bet");
  } else {
    acts.push("call");
    if (maxTotal > state.currentBet && responders > 0) acts.push("raise");
  }
  if (p.stack > 0 && (responders > 0 || toCall > 0)) acts.push("allin");
  return acts;
}

/** Validates and applies an action. Throws on illegal input. */
export function applyAction(input: HandState, req: ActionRequest, config: BlindConfig): HandState {
  const legal = legalActions(input, req.seat, config);
  if (!legal.includes(req.type)) throw new Error(`Illegal action ${req.type} for seat ${req.seat}; legal: ${legal.join(",") || "none"}`);

  const state = clone(input);
  const p = state.seats[req.seat]!;
  const b = bounds(state, req.seat, config);

  const put = (total: number) => {
    const add = total - p.committed;
    p.stack -= add;
    p.committed = total;
    p.totalIn += add;
    state.pot += add;
    if (p.stack === 0) p.allIn = true;
  };
  const reopen = (increment: number) => {
    if (increment >= state.minRaise) state.minRaise = increment;
    state.lastAggressor = req.seat;
    for (const i of activeSeats(state)) if (i !== req.seat) state.seats[i]!.acted = false;
  };

  let type = req.type;
  let amount: number | undefined;

  switch (type) {
    case "fold":
      p.folded = true;
      break;
    case "check":
      break;
    case "call":
      put(Math.min(state.currentBet, b.maxTotal));
      amount = p.committed;
      break;
    case "bet":
    case "raise": {
      const total = req.amount ?? b.minTotal;
      if (total < b.minTotal || total > b.maxTotal) throw new Error(`${type} total ${total} outside [${b.minTotal}, ${b.maxTotal}]`);
      const increment = total - state.currentBet;
      state.currentBet = total;
      put(total);
      reopen(increment);
      amount = total;
      break;
    }
    case "allin": {
      const total = b.maxTotal;
      if (total > state.currentBet) {
        const increment = total - state.currentBet;
        state.currentBet = total;
        put(total);
        reopen(increment);
      } else {
        type = "call"; // all-in for less is a call
        put(total);
      }
      amount = total;
      break;
    }
  }
  p.acted = true;
  state.actions.push({ seat: req.seat, type, amount, street: state.street, latencyMs: req.latencyMs, at: Date.now() });

  if (liveSeats(state).length === 1) return finish(state, true);

  if (streetClosed(state)) return advanceStreet(state, config);

  state.toAct = nextSeat(state, req.seat, (x) => !x.folded && !x.allIn);
  return state;
}

/** Every player who can still act has acted since the last raise and matched the current bet. */
function streetClosed(state: HandState): boolean {
  const active = activeSeats(state);
  return active.every((i) => {
    const s = state.seats[i]!;
    return s.acted && s.committed === state.currentBet;
  });
}

const NEXT_STREET: Record<Street, Street> = { preflop: "flop", flop: "turn", turn: "river", river: "showdown", showdown: "showdown" };

function advanceStreet(input: HandState, config: BlindConfig): HandState {
  const state = clone(input);
  for (const s of state.seats) {
    if (!s) continue;
    s.committed = 0;
    s.acted = false;
  }
  state.currentBet = 0;
  state.minRaise = config.bigBlind;
  state.street = NEXT_STREET[state.street];

  if (state.street === "flop") state.board.push(state.deck.pop() as Card, state.deck.pop() as Card, state.deck.pop() as Card);
  else if (state.street === "turn" || state.street === "river") state.board.push(state.deck.pop() as Card);

  if (state.street === "showdown") return showdown(state);

  state.toAct = nextSeat(state, state.button, (x) => !x.folded && !x.allIn);
  return settleIfNoActionLeft(state, config);
}

/** If at most one player can still act, nobody has a decision left: run the board out. */
function settleIfNoActionLeft(input: HandState, config: BlindConfig): HandState {
  if (input.over) return input;
  const active = activeSeats(input);
  // One active player still has a decision only if someone has bet more than they have committed.
  const pending = active.some((i) => input.seats[i]!.committed < input.currentBet);
  if (active.length > 1 || pending) return input;
  let state = input;
  state = { ...state, toAct: null };
  while (state.street !== "showdown" && !state.over) state = advanceStreet(state, config);
  return state;
}

// ---------- pots and payout ----------

/**
 * Side pots by contribution level. Folded players' chips stay in the pots they contributed to but
 * they are never eligible. Call after refunding any uncalled excess.
 */
export function computePots(seats: (SeatState | null)[]): Pot[] {
  const live = seats.map((s, i) => (s && !s.folded ? i : -1)).filter((i) => i >= 0);
  const levels = [...new Set(live.map((i) => seats[i]!.totalIn))].filter((x) => x > 0).sort((a, b) => a - b);
  const pots: Pot[] = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const s of seats) if (s) amount += Math.max(0, Math.min(s.totalIn, level) - prev);
    const eligible = live.filter((i) => seats[i]!.totalIn >= level);
    if (amount > 0) pots.push({ amount, eligible });
    prev = level;
  }
  // Anything a folded player put in above the top live level (rare: raise then fold to a shove) goes to the last pot.
  let extra = 0;
  for (const s of seats) if (s) extra += Math.max(0, s.totalIn - prev);
  if (extra > 0 && pots.length) pots[pots.length - 1].amount += extra;
  return pots;
}

/** Return chips nobody could call: the excess of the single largest contributor over the second largest. */
function refundUncalled(state: HandState) {
  const ins = dealtSeats(state).map((i) => ({ i, totalIn: state.seats[i]!.totalIn })).sort((a, b) => b.totalIn - a.totalIn);
  if (ins.length < 2) return;
  const [top, second] = ins;
  const excess = top.totalIn - second.totalIn;
  if (excess <= 0) return;
  const s = state.seats[top.i]!;
  s.stack += excess;
  s.totalIn -= excess;
  state.pot -= excess;
}

function showdown(input: HandState): HandState {
  const state = clone(input);
  refundUncalled(state);
  state.pots = computePots(state.seats);

  const live = liveSeats(state);
  const solved = new Map<number, Hand>();
  for (const i of live) solved.set(i, Hand.solve([...state.seats[i]!.holeCards, ...state.board]));

  const won = new Map<number, number>(live.map((i) => [i, 0]));
  for (const pot of state.pots) {
    const hands = pot.eligible.map((i) => solved.get(i)!);
    const winners = Hand.winners(hands);
    const winnerSeats = pot.eligible.filter((_, k) => winners.includes(hands[k]));
    const share = Math.floor(pot.amount / winnerSeats.length);
    let remainder = pot.amount - share * winnerSeats.length;
    // Odd chips go to the first winner(s) left of the button.
    const ordered = orderFromButton(state, winnerSeats);
    for (const i of ordered) {
      const bonus = remainder > 0 ? 1 : 0;
      remainder -= bonus;
      won.set(i, (won.get(i) ?? 0) + share + bonus);
    }
  }

  state.results = live.map<HandResult>((i) => ({ seat: i, won: won.get(i) ?? 0, descr: solved.get(i)!.descr }));
  for (const r of state.results) state.seats[r.seat]!.stack += r.won;
  state.over = true;
  state.toAct = null;
  state.foldedOut = false;
  return state;
}

/** Everyone else folded: refund uncalled excess, then award everything to the last player standing. */
function finish(input: HandState, foldedOut: boolean): HandState {
  const state = clone(input);
  refundUncalled(state);
  const [winner] = liveSeats(state);
  state.pots = [{ amount: state.pot, eligible: [winner] }];
  state.results = [{ seat: winner, won: state.pot }];
  state.seats[winner]!.stack += state.pot;
  state.over = true;
  state.toAct = null;
  state.foldedOut = foldedOut;
  return state;
}

function orderFromButton(state: Pick<HandState, "seats" | "button">, seats: number[]): number[] {
  const n = state.seats.length;
  return [...seats].sort((a, b) => ((a - state.button - 1 + n) % n) - ((b - state.button - 1 + n) % n));
}

// ---------- views ----------

/**
 * Strip the deck and hide hole cards the viewer may not see.
 * `viewer` = seat index (sees own cards; others only at showdown), or "all" for the rail.
 */
export function publicHand(state: HandState, viewer: number | "all"): HandView {
  const { deck: _deck, ...rest } = state;
  void _deck;
  if (viewer === "all") return rest;
  return {
    ...rest,
    seats: rest.seats.map((s, i) => {
      if (!s) return null;
      const shown = i === viewer || (state.over && !state.foldedOut && !s.folded);
      return shown ? s : { ...s, holeCards: [] };
    }),
  };
}

/** Sum of all stacks plus chips in the middle: must be constant across a hand. */
export function totalChips(state: Pick<HandState, "seats" | "pot" | "over">): number {
  return state.seats.reduce((a, s) => a + (s?.stack ?? 0), 0) + (state.over ? 0 : state.pot);
}
