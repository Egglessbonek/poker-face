/**
 * Heads-up No-Limit Hold'em state machine.
 *
 * Pure functions over HandState so the same engine runs on client (UI) and server (validation).
 * Heads-up rules: button posts SB and acts first preflop; BB acts first on every later street.
 *
 * TODO(phase 1):
 *  - newHand(): post blinds, deal hole cards, set toAct
 *  - legalActions(): fold/check/call/bet/raise/allin with min-raise and short-stack handling
 *  - applyAction(): validate, mutate committed/pot/stack, advance street when action closes
 *  - advanceStreet(): deal board, reset committed/currentBet, set toAct
 *  - resolveShowdown(): pokersolver comparison, award pot (side-pot-free since heads-up but
 *    handle uneven all-ins by returning the excess)
 */

import type { Action, ActionType, Card, HandState, MatchConfig, Seat } from "@/lib/types";
import { freshDeck, shuffle } from "./cards";

export function otherSeat(seat: Seat): Seat {
  return seat === "hero" ? "villain" : "hero";
}

export function newHand(
  handNumber: number,
  stacks: Record<Seat, number>,
  button: Seat,
  config: MatchConfig,
  rng?: () => number,
): HandState {
  const deck = shuffle(freshDeck(), rng);
  const sbSeat = button; // heads-up: button is small blind
  const bbSeat = otherSeat(button);

  const players: HandState["players"] = {
    hero: { seat: "hero", stack: stacks.hero, committed: 0, holeCards: [], folded: false, allIn: false },
    villain: { seat: "villain", stack: stacks.villain, committed: 0, holeCards: [], folded: false, allIn: false },
  };

  // Deal two cards each.
  players[sbSeat].holeCards = [deck.pop() as Card, deck.pop() as Card];
  players[bbSeat].holeCards = [deck.pop() as Card, deck.pop() as Card];

  // Post blinds (short-stack safe).
  const sb = Math.min(config.smallBlind, players[sbSeat].stack);
  const bb = Math.min(config.bigBlind, players[bbSeat].stack);
  players[sbSeat].stack -= sb;
  players[sbSeat].committed = sb;
  players[bbSeat].stack -= bb;
  players[bbSeat].committed = bb;
  players[sbSeat].allIn = players[sbSeat].stack === 0;
  players[bbSeat].allIn = players[bbSeat].stack === 0;

  return {
    handNumber,
    street: "preflop",
    board: [],
    pot: sb + bb,
    players,
    button,
    toAct: sbSeat,
    currentBet: bb,
    minRaise: config.bigBlind,
    actions: [],
    deck,
  };
}

export function legalActions(state: HandState, seat: Seat): ActionType[] {
  // TODO(phase 1): full implementation.
  const p = state.players[seat];
  if (state.toAct !== seat || p.folded || p.allIn) return [];
  const toCall = state.currentBet - p.committed;
  const acts: ActionType[] = ["fold"];
  if (toCall === 0) acts.push("check", "bet");
  else acts.push("call", "raise");
  acts.push("allin");
  return acts;
}

export function applyAction(state: HandState, action: Action): HandState {
  // TODO(phase 1): validate against legalActions, mutate pot/stacks, close street, resolve showdown.
  void state;
  void action;
  throw new Error("applyAction not implemented");
}

export function isHandOver(state: HandState): boolean {
  return state.street === "showdown" || state.players.hero.folded || state.players.villain.folded;
}

/** Strip server-only fields before sending to the client or the rail. */
export function publicHand(state: HandState, hideSeat?: Seat): Omit<HandState, "deck"> {
  const { deck: _deck, ...rest } = state;
  void _deck;
  if (!hideSeat) return rest;
  return {
    ...rest,
    players: {
      ...rest.players,
      [hideSeat]: { ...rest.players[hideSeat], holeCards: [] },
    },
  };
}
