/**
 * Heads-up No-Limit Hold'em state machine.
 *
 * Pure functions over HandState (they return new objects; inputs are not mutated) so the same engine
 * runs on the client for display and on the server as the source of truth.
 *
 * Heads-up rules: the button posts the small blind and acts first preflop; the big blind acts first
 * on every later street. `pot` always equals the total chips in the middle including current-street
 * commitments. `Action.amount` for bet/raise/call/allin is the seat's total committed on that street
 * after the action.
 */

import { Hand } from "pokersolver";
import type { ActionBounds, ActionType, Card, HandState, MatchConfig, PlayerState, Seat } from "@/lib/types";
import { freshDeck, shuffle } from "./cards";

export function otherSeat(seat: Seat): Seat {
  return seat === "hero" ? "villain" : "hero";
}

function clone(state: HandState): HandState {
  return {
    ...state,
    board: [...state.board],
    actions: [...state.actions],
    deck: [...state.deck],
    players: {
      hero: { ...state.players.hero, holeCards: [...state.players.hero.holeCards] },
      villain: { ...state.players.villain, holeCards: [...state.players.villain.holeCards] },
    },
  };
}

export function newHand(handNumber: number, stacks: Record<Seat, number>, button: Seat, config: MatchConfig, rng?: () => number): HandState {
  const deck = shuffle(freshDeck(), rng);
  const sbSeat = button;
  const bbSeat = otherSeat(button);

  const mk = (seat: Seat): PlayerState => ({ seat, stack: stacks[seat], committed: 0, holeCards: [], folded: false, allIn: false, totalIn: 0, acted: false });
  const players: HandState["players"] = { hero: mk("hero"), villain: mk("villain") };

  players[sbSeat].holeCards = [deck.pop() as Card, deck.pop() as Card];
  players[bbSeat].holeCards = [deck.pop() as Card, deck.pop() as Card];

  const post = (seat: Seat, amount: number) => {
    const p = players[seat];
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
    pot: players.hero.committed + players.villain.committed,
    players,
    button,
    toAct: sbSeat,
    currentBet: Math.max(players.hero.committed, players.villain.committed),
    minRaise: config.bigBlind,
    actions: [],
    deck,
    over: false,
  };

  // Both blinds all-in (or one all-in and the other covering) can end action immediately.
  return settleIfNoActionLeft(state, config);
}

export function bounds(state: HandState, seat: Seat, config: MatchConfig): ActionBounds {
  const p = state.players[seat];
  const toCall = Math.max(0, state.currentBet - p.committed);
  const maxTotal = p.stack + p.committed;
  const minTotal = state.currentBet === 0 ? Math.min(config.bigBlind, maxTotal) : Math.min(state.currentBet + state.minRaise, maxTotal);
  return { toCall, minTotal, maxTotal };
}

export function legalActions(state: HandState, seat: Seat, config: MatchConfig): ActionType[] {
  const p = state.players[seat];
  if (state.over || state.toAct !== seat || p.folded || p.allIn) return [];
  const { toCall, maxTotal } = bounds(state, seat, config);
  const acts: ActionType[] = [];
  if (toCall === 0) {
    acts.push("check");
    if (p.stack > 0) acts.push("bet");
  } else {
    acts.push("fold", "call");
    // A raise needs chips beyond the call and the opponent must be able to respond (not all-in).
    if (maxTotal > state.currentBet && !state.players[otherSeat(seat)].allIn) acts.push("raise");
  }
  if (p.stack > 0) acts.push("allin");
  return acts;
}

export interface ActionRequest {
  seat: Seat;
  type: ActionType;
  /** Total committed after the action, for bet/raise. Ignored for other types. */
  amount?: number;
  latencyMs?: number;
}

/** Validates and applies an action. Throws on illegal input. */
export function applyAction(input: HandState, req: ActionRequest, config: MatchConfig): HandState {
  const legal = legalActions(input, req.seat, config);
  if (!legal.includes(req.type)) throw new Error(`Illegal action ${req.type} for ${req.seat}; legal: ${legal.join(",") || "none"}`);

  const state = clone(input);
  const p = state.players[req.seat];
  const opp = state.players[otherSeat(req.seat)];
  const b = bounds(state, req.seat, config);
  const put = (total: number) => {
    const add = total - p.committed;
    p.stack -= add;
    p.committed = total;
    p.totalIn += add;
    state.pot += add;
    if (p.stack === 0) p.allIn = true;
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
      if (increment >= state.minRaise) state.minRaise = increment;
      state.currentBet = total;
      put(total);
      amount = total;
      opp.acted = false; // opponent must respond
      break;
    }
    case "allin": {
      const total = b.maxTotal;
      if (total > state.currentBet) {
        const increment = total - state.currentBet;
        if (increment >= state.minRaise) state.minRaise = increment;
        state.currentBet = total;
        opp.acted = false;
      } else {
        type = "call"; // all-in for less is a call
      }
      put(total);
      amount = total;
      break;
    }
  }
  p.acted = true;
  state.actions.push({ seat: req.seat, type, amount, street: state.street, latencyMs: req.latencyMs, at: Date.now() });

  if (p.folded) {
    return finish(state, otherSeat(req.seat));
  }

  // Is the street closed? Both have acted and commitments match (or someone is all-in and matched).
  const matched = p.committed === opp.committed || p.allIn || opp.allIn;
  const bothActed = p.acted && (opp.acted || opp.allIn);
  if (matched && bothActed) {
    return advanceStreet(state, config);
  }
  state.toAct = otherSeat(req.seat);
  return state;
}

function advanceStreet(input: HandState, config: MatchConfig): HandState {
  const state = clone(input);
  for (const seat of ["hero", "villain"] as Seat[]) {
    state.players[seat].committed = 0;
    state.players[seat].acted = false;
  }
  state.currentBet = 0;
  state.minRaise = config.bigBlind;

  const next: Record<string, HandState["street"]> = { preflop: "flop", flop: "turn", turn: "river", river: "showdown" };
  state.street = next[state.street];
  if (state.street === "flop") state.board.push(state.deck.pop() as Card, state.deck.pop() as Card, state.deck.pop() as Card);
  else if (state.street === "turn" || state.street === "river") state.board.push(state.deck.pop() as Card);

  if (state.street === "showdown") return showdown(state);
  // Big blind (non-button) acts first postflop.
  state.toAct = otherSeat(state.button);
  return settleIfNoActionLeft(state, config);
}

/** If either player is all-in and the other has nothing left to decide, run the board out. */
function settleIfNoActionLeft(input: HandState, config: MatchConfig): HandState {
  const { hero, villain } = input.players;
  const matched = hero.committed === villain.committed;
  const noAction = (hero.allIn && villain.allIn) || ((hero.allIn || villain.allIn) && matched);
  if (!noAction) return input;
  let state = input;
  while (state.street !== "showdown" && !state.over) state = advanceStreet(state, config);
  return state;
}

function showdown(input: HandState): HandState {
  const state = clone(input);
  const h = Hand.solve([...state.players.hero.holeCards, ...state.board]);
  const v = Hand.solve([...state.players.villain.holeCards, ...state.board]);
  const winners = Hand.winners([h, v]);
  state.showdown = { hero: h.descr, villain: v.descr };
  const winner: Seat | "split" = winners.length === 2 ? "split" : winners[0] === h ? "hero" : "villain";
  return finish(state, winner);
}

/** Refund any uncalled excess, then award the pot. */
function finish(input: HandState, winner: Seat | "split"): HandState {
  const state = clone(input);
  const { hero, villain } = state.players;
  const excess = hero.totalIn - villain.totalIn;
  if (excess > 0) { hero.stack += excess; hero.totalIn -= excess; state.pot -= excess; }
  if (excess < 0) { villain.stack += -excess; villain.totalIn -= -excess; state.pot -= -excess; }

  if (winner === "split") {
    const half = Math.floor(state.pot / 2);
    hero.stack += half;
    villain.stack += state.pot - half;
  } else {
    state.players[winner].stack += state.pot;
  }
  state.winner = winner;
  state.over = true;
  state.toAct = null;
  if (state.street !== "showdown" && winner !== "split" && !state.showdown) {
    // Fold: leave street as-is so the UI can show where it ended.
  }
  return state;
}

export function isHandOver(state: HandState): boolean {
  return state.over;
}

/** Strip the deck and, unless the hand is over, the given seat's hole cards. */
export function publicHand(state: HandState, hideSeat?: Seat): Omit<HandState, "deck"> {
  const { deck: _deck, ...rest } = state;
  void _deck;
  if (!hideSeat || state.over) return rest;
  return { ...rest, players: { ...rest.players, [hideSeat]: { ...rest.players[hideSeat], holeCards: [] } } };
}
