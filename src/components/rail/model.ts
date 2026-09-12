export type RailConnectionState = "connecting" | "live" | "ended" | "not-found" | "disconnected";

export type RailStreet = "preflop" | "flop" | "turn" | "river" | "showdown";

export interface RailCard {
  rank: string;
  suit: "spades" | "hearts" | "diamonds" | "clubs";
}

export interface RailTell {
  arousal: number;
  bluffLikelihood: number;
  confidence: number;
  trend: "rising" | "falling" | "stable";
  evidence: string[];
  emotion: string;
}

export interface RailAiRead {
  equity: number;
  mathAction: string;
  finalAction: string;
  target: string;
  reasoning: string;
  tellsUsed: string[];
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
  folded: boolean;
  allIn: boolean;
  position: string;
  isButton?: boolean;
  isSmallBlind?: boolean;
  isBigBlind?: boolean;
  lastAction?: string;
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
  spectators: number;
  tellVisibility: "ai-only" | "everyone" | "rail";
  players: RailPlayerView[];
}

export interface RailViewModel {
  connection: RailConnectionState;
  table: RailTableSnapshot | null;
  history: RailHistoryEntry[];
}
