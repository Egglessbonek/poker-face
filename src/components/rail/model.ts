export type RailConnectionState = "connecting" | "live" | "ended" | "not-found" | "disconnected";

export type RailStreet = "preflop" | "flop" | "turn" | "river" | "showdown";

export interface RailCard {
  rank: string;
  suit: "spades" | "hearts" | "diamonds" | "clubs";
}

export interface RailTell {
  /** False until this player's first decision has been fused: a bare camera frame is a signal, not a read. */
  read: boolean;
  faceLocked: boolean;
  /** Blinks per minute from the live frame. */
  blinkRate?: number;
  /** Jaw/brow tension from the live frame, 0-100. */
  tension?: number;
  arousal?: number;
  bluffLikelihood?: number;
  confidence?: number;
  trend?: "rising" | "falling" | "stable";
  evidence: string[];
  emotion: string;
}

export interface RailAiRead {
  equity?: number;
  mathAction: string;
  finalAction: string;
  target: string;
  reasoning: string;
  tellsUsed: string[];
  /** Epoch ms of the decision, so the newest read can be spotlighted. */
  at?: number;
}

export interface RailPlayerView {
  id: string;
  name: string;
  kind: "human" | "ai";
  persona?: string;
  seatIndex: number;
  stack: number;
  committed: number;
  cards: RailCard[];
  /** Whether this seat was dealt into the current hand. */
  inHand: boolean;
  /** The server controls whether this viewer may see the cards. */
  cardsVisible: boolean;
  folded: boolean;
  allIn: boolean;
  position: string;
  isButton?: boolean;
  isSmallBlind?: boolean;
  isBigBlind?: boolean;
  lastAction?: string;
  /** Current showdown equity against the other non-folded dealt hands, including possible runouts. */
  equity?: number;
  /** Best made-hand category on the current street. */
  bestHand?: string;
  talk?: string;
  tell?: RailTell;
  aiRead?: RailAiRead;
}

export interface RailPotView {
  id: string;
  label: string;
  amount: number;
  eligiblePlayerIds: string[];
}

export interface RailHistoryEntry {
  id: string;
  handNumber: number;
  street: RailStreet;
  playerName?: string;
  message: string;
  tone: "action" | "deal" | "talk" | "result";
  /** The acting player is an AI seat (drives the bot icon). */
  isAi?: boolean;
}

export interface RailTableSnapshot {
  code: string;
  phase: "lobby" | "calibrating" | "playing" | "finished";
  handNumber: number;
  handsPerMatch: number;
  street: RailStreet;
  board: RailCard[];
  pots: RailPotView[];
  currentPlayerId: string | null;
  turnSecondsRemaining: number | null;
  /** Chairs at the table, for seat placement around the felt. */
  seatCount: number;
  tellVisibility: "ai-only" | "everyone" | "rail";
  players: RailPlayerView[];
  /** Final standings once the match is over (best stack first). */
  standings?: Array<{ playerId: string; name: string; stack: number; net: number; isAi: boolean }>;
}

export interface RailViewModel {
  connection: RailConnectionState;
  table: RailTableSnapshot | null;
  history: RailHistoryEntry[];
}
