/**
 * Shared domain types for Poker Face.
 * Everything that crosses a module boundary (client <-> server, tells -> AI, table -> rail)
 * is defined here so the shape is agreed on once.
 */

// ---------- Cards ----------

export type Suit = "s" | "h" | "d" | "c";
export type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "T" | "J" | "Q" | "K" | "A";
/** Card code in pokersolver format, e.g. "As", "Th", "2c". */
export type Card = `${Rank}${Suit}`;

// ---------- Poker (N-player NLHE) ----------

export type Street = "preflop" | "flop" | "turn" | "river" | "showdown";

export type ActionType = "fold" | "check" | "call" | "bet" | "raise" | "allin";

export interface Action {
  /** Seat index of the actor. */
  seat: number;
  type: ActionType;
  /** Total amount the seat has committed on this street after the action (bet/raise/call/allin). */
  amount?: number;
  street: Street;
  /** ms since the seat was prompted to act. Behavioral tell. */
  latencyMs?: number;
  at: number; // epoch ms
}

/** Per-seat state within one hand. `null` entries in `HandState.seats` are empty or not dealt in. */
export interface SeatState {
  playerId: string;
  stack: number;
  /** Chips committed on the current street. */
  committed: number;
  /** Total chips put into the pot this hand (all streets). Drives side pots and refunds. */
  totalIn: number;
  holeCards: Card[];
  folded: boolean;
  allIn: boolean;
  /** Has this seat acted on the current street since the last bet/raise? */
  acted: boolean;
}

export interface Pot {
  amount: number;
  /** Seat indices that can win this pot (non-folded players who contributed to this level). */
  eligible: number[];
}

export interface HandResult {
  seat: number;
  /** Chips won from all pots (0 for losers who reached showdown). */
  won: number;
  /** pokersolver description of the shown hand, when the seat reached showdown. */
  descr?: string;
}

export interface HandState {
  handNumber: number;
  street: Street;
  board: Card[];
  /** Total chips in the middle, including current-street commitments. Equals the sum of `totalIn`. */
  pot: number;
  seats: (SeatState | null)[];
  /** Seat index holding the dealer button. */
  button: number;
  toAct: number | null;
  /** Current bet to match on this street. */
  currentBet: number;
  minRaise: number;
  /** Last seat to bet or raise this hand (shows first at showdown). */
  lastAggressor: number | null;
  actions: Action[];
  deck: Card[];
  over: boolean;
  /** Set once the hand is over. */
  pots?: Pot[];
  results?: HandResult[];
  /** True when the hand ended by everyone else folding (no cards shown). */
  foldedOut?: boolean;
}

/** HandState as clients see it: no deck, hole cards filtered per viewer. */
export type HandView = Omit<HandState, "deck">;

/** Amount bounds for the seat to act, for UI sliders and server validation. */
export interface ActionBounds {
  toCall: number;
  /** Minimum total (committed after action) for a bet or raise. */
  minTotal: number;
  /** Maximum total = stack + committed (all-in). */
  maxTotal: number;
}

// ---------- Table ----------

export type TellVisibility = "ai_and_rail" | "everyone" | "ai_only" | "rail_only" | "off";

export interface TableConfig {
  /** 2-9 */
  maxSeats: number;
  startingStack: number;
  smallBlind: number;
  bigBlind: number;
  /** 0 = play until one player has all the chips. */
  handsPerMatch: number;
  /** Human auto check/fold when the timer expires. 0 = no timer. */
  turnTimerSec: number;
  tellVisibility: TellVisibility;
  /** OpenRouter model ids seated at creation; duplicates allowed. */
  aiPlayers: string[];
  /** Humans joining mid-game get a seat next hand. */
  allowLateJoin: boolean;
  /** TTS table talk for AI players. */
  voice: boolean;
}

export const DEFAULT_TABLE: TableConfig = {
  maxSeats: 6,
  startingStack: 200,
  smallBlind: 1,
  bigBlind: 2,
  handsPerMatch: 15,
  turnTimerSec: 30,
  tellVisibility: "ai_and_rail",
  aiPlayers: ["anthropic/claude-sonnet-5", "openai/gpt-5.6-terra"],
  allowLateJoin: true,
  voice: true,
};

export interface Player {
  id: string;
  seat: number;
  name: string;
  kind: "human" | "ai";
  /** OpenRouter model id for AI seats. */
  modelId?: string;
  /** ElevenLabs voice assigned to this seat; unique within a table. */
  voiceId?: string;
  stack: number;
  connected: boolean;
  sittingOut: boolean;
}

export type TablePhase = "lobby" | "playing" | "finished";

export interface TableState {
  code: string;
  config: TableConfig;
  phase: TablePhase;
  hostId: string;
  players: Player[];
  /** Current hand, with hole cards and deck filtered per viewer by the server. */
  hand: HandView | null;
  handNumber: number;
  /** Epoch ms when the current human turn auto-folds. */
  turnDeadline?: number;
  createdAt: number;
  /** Final standings once finished. */
  standings?: Array<{ playerId: string; name: string; stack: number; net: number }>;
}

/** Who is looking at the table; controls which hole cards and tells are visible. */
export type Viewer = { kind: "player"; playerId: string } | { kind: "rail" };

/** Live tells for one human player, as last reported by their browser. */
export interface PlayerTells {
  frame: TellFrame | null;
  vector: TellVector | null;
  at: number;
}

export type TableEvent =
  | { type: "state"; state: TableState }
  | { type: "action"; action: Action; playerId: string }
  | { type: "talk"; playerId: string; text: string; voiceId?: string }
  | { type: "tells"; playerId: string; tells: PlayerTells }
  | { type: "ai_decision"; playerId: string; decision: VillainDecision; handNumber: number; street: Street }
  | { type: "hand_end"; hand: HandView }
  | { type: "ended"; code: string };

// ---------- Tells ----------

export type GazeTarget = "cards" | "chips" | "opponent" | "away" | "unknown";

export type Emotion = "neutral" | "happy" | "surprise" | "fear" | "anger" | "disgust" | "sad";

/** One sample of camera-derived features, emitted ~4x/s (aggregated from ~30fps detections). */
export interface TellFrame {
  t: number; // epoch ms
  facePresent: boolean;
  confidence: number; // 0-1 landmark quality
  blinkRate: number; // blinks/min over rolling window
  gaze: GazeTarget;
  headMotion: number; // rolling variance of head pose (raw units)
  tension: number; // 0-1 composite of brow/jaw/lip blendshapes
  smile: number; // 0-1 mouthSmile
  duchenne: boolean; // smile with cheekSquint
  emotion: Record<Emotion, number>; // normalized, sums to ~1
  fakeSmile: boolean;
}

/** Cursor behavior over the action bar during one decision. */
export interface CursorStats {
  timeToFirstMoveMs: number;
  tortuosity: number; // path length / straight-line distance (1 = straight)
  reversals: number;
  hoverFoldMs: number;
  hoverBetMs: number;
  peakVelocity: number;
}

/** Voice-derived features for one decision window (optional; player need not talk). */
export interface VoiceStats {
  spoke: boolean;
  words: number;
  pitchDelta: number; // ratio vs baseline (1 = same)
  energyDelta: number;
  responseLatencyMs?: number;
  transcript?: string;
}

export interface BaselineStats {
  blinkRate: number;
  headMotion: number;
  tension: number;
  smile: number;
  pitchHz?: number;
  energy?: number;
  decisionLatencyMs: number; // running median, updated during play
  calibratedAt: number;
}

export interface Evidence {
  signal: string; // e.g. "blink_rate", "freeze", "chip_glance"
  direction: "bluff" | "strength" | "neutral";
  strength: number; // 0-1
  text: string; // human readable: "blink rate 2.1x baseline"
}

/** Aggregated tells for one decision. This is what the AI sees. */
export interface TellSnapshot {
  handNumber: number;
  street: Street;
  decisionLatencyMs: number;
  frames: TellFrame[]; // frames in the decision window
  cursor?: CursorStats;
  voice?: VoiceStats;
  cardRevealReactions: Array<{ event: "hole" | "flop" | "turn" | "river"; smileLeak: boolean; chipGlance: boolean; peakTension: number }>;
}

export interface TellVector {
  arousal: number; // 0-100
  bluffLikelihood: number; // 0-1
  confidence: number; // 0-1
  trend: "rising" | "falling" | "stable";
  evidence: Evidence[];
}

// ---------- AI players ----------

/** Who an AI seat is: an OpenRouter model, named as OpenRouter names it. */
export interface ModelProfile {
  /** OpenRouter model id, e.g. "anthropic/claude-sonnet-5". */
  id: string;
  name: string;
  vendor: string;
  /** ElevenLabs voice id for TTS table talk. */
  voiceId?: string;
}

export interface OpponentView {
  seat: number;
  name: string;
  kind: "human" | "ai";
  stack: number;
  committed: number;
  folded: boolean;
  allIn: boolean;
  /** Seat position label relative to the button: "BTN", "SB", "BB", "UTG", ... */
  position: string;
  tells: TellVector | null;
  /** Tendencies observed this match. */
  stats?: PlayerStats;
  /** What they did preflop this hand: raised, called, limped, checked, or none yet. */
  preflop?: "raised" | "called" | "limped" | "checked" | "none";
}

/** Running tendencies for one player over the match (poker-style stats). */
export interface PlayerStats {
  hands: number;
  /** Hands where they voluntarily put chips in preflop. */
  vpip: number;
  /** Hands where they raised preflop. */
  pfr: number;
  /** Bets + raises across all streets. */
  aggressive: number;
  calls: number;
  showdownsWon: number;
  showdowns: number;
}

export interface VillainDecisionInput {
  hand: Pick<HandState, "handNumber" | "street" | "board" | "pot" | "currentBet" | "minRaise" | "actions">;
  me: { seat: number; holeCards: Card[]; stack: number; committed: number; position: string };
  opponents: OpponentView[];
  /** Seat -> display name, for rendering the action history. */
  names: Record<number, string>;
  legalActions: ActionType[];
  bounds: ActionBounds;
  /** 0-1 equity vs the live opponents' estimated ranges. */
  equity: number;
  potOdds: number; // 0-1
  bigBlind: number;
  /** Did this seat make the last bet or raise of the previous street? */
  hasInitiative: boolean;
  raisesThisStreet: number;
  modelId: string;
  /** This seat's most recent table-talk lines, newest last, so it does not repeat itself. */
  recentTalk: string[];
}

export interface VillainDecision {
  action: ActionType;
  amount?: number;
  reasoning: string;
  tableTalk: string;
  tellsUsed: string[];
  /** What the math layer alone would have done. Shown on the reveal. */
  mathAction: ActionType;
  llmUsed: boolean;
}

// ---------- Log / Reveal ----------

export type TableLogKind = "table_start" | "hand_start" | "action" | "tells" | "ai_decision" | "talk" | "hand_end" | "table_end";

export interface TableLogEntry {
  t: number;
  kind: TableLogKind;
  data: unknown;
}

export interface TableLog {
  code: string;
  createdAt: number;
  endedAt?: number;
  config: TableConfig;
  players: Player[];
  baselines: Record<string, BaselineStats>;
  entries: TableLogEntry[];
}
