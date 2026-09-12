/**
 * Shared domain types for Poker Face.
 * Everything that crosses a module boundary (client <-> server, tells -> villain, game -> rail)
 * is defined here so the shape is agreed on once.
 */

// ---------- Poker ----------

export type Suit = "s" | "h" | "d" | "c";
export type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "T" | "J" | "Q" | "K" | "A";
/** Card code in pokersolver format, e.g. "As", "Th", "2c". */
export type Card = `${Rank}${Suit}`;

export type Street = "preflop" | "flop" | "turn" | "river" | "showdown";
export type Seat = "hero" | "villain";

export type ActionType = "fold" | "check" | "call" | "bet" | "raise" | "allin";

export interface Action {
  seat: Seat;
  type: ActionType;
  /** Total amount put in on this street after the action (for bet/raise/call/allin). */
  amount?: number;
  street: Street;
  /** ms since the seat was prompted to act. Behavioral tell. */
  latencyMs?: number;
  at: number; // epoch ms
}

export interface PlayerState {
  seat: Seat;
  stack: number;
  /** Chips committed on the current street. */
  committed: number;
  holeCards: Card[];
  folded: boolean;
  allIn: boolean;
  /** Total chips put into the pot this hand (all streets). Used to refund uncalled excess. */
  totalIn: number;
  /** Has this seat acted on the current street since the last bet/raise? */
  acted: boolean;
}

export interface HandState {
  handNumber: number;
  street: Street;
  board: Card[];
  /** Total chips in the middle, including current-street commitments. */
  pot: number;
  players: Record<Seat, PlayerState>;
  /** Seat holding the dealer button (heads-up: button posts SB and acts first preflop). */
  button: Seat;
  toAct: Seat | null;
  /** Current bet to match on this street. */
  currentBet: number;
  minRaise: number;
  actions: Action[];
  deck: Card[];
  over: boolean;
  winner?: Seat | "split";
  /** Hand descriptions at showdown (pokersolver descr). */
  showdown?: { hero?: string; villain?: string };
}

/** Amount bounds for the seat to act, for UI sliders and server validation. */
export interface ActionBounds {
  toCall: number;
  /** Minimum total (committed after action) for a bet or raise. */
  minTotal: number;
  /** Maximum total = stack + committed (all-in). */
  maxTotal: number;
}

export interface MatchState {
  config: MatchConfig;
  handNumber: number;
  stacks: Record<Seat, number>;
  button: Seat;
  hand: HandState | null;
  over: boolean;
  results: Array<{ handNumber: number; winner: Seat | "split"; pot: number; heroCards: Card[]; villainCards: Card[]; board: Card[] }>;
}

/** What the client is allowed to see. Villain hole cards only after the hand is over. */
export interface PublicMatchState {
  config: MatchConfig;
  handNumber: number;
  stacks: Record<Seat, number>;
  button: Seat;
  hand: Omit<HandState, "deck"> | null;
  over: boolean;
  results: MatchState["results"];
  legalActions: ActionType[];
  bounds: ActionBounds | null;
}

export interface MatchConfig {
  startingStack: number;
  smallBlind: number;
  bigBlind: number;
  handsPerMatch: number;
}

export const DEFAULT_MATCH: MatchConfig = {
  startingStack: 200,
  smallBlind: 1,
  bigBlind: 2,
  handsPerMatch: 10,
};

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

/** Aggregated tells for one hero decision. This is what the villain sees. */
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

// ---------- Villain ----------

export interface Persona {
  id: string;
  name: string;
  tagline: string;
  style: string; // prompt fragment
  elevenLabsAgentId?: string;
  voiceId?: string;
}

export interface VillainDecisionInput {
  hand: Pick<HandState, "handNumber" | "street" | "board" | "pot" | "currentBet" | "minRaise" | "actions">;
  villain: { holeCards: Card[]; stack: number; committed: number };
  hero: { stack: number; committed: number };
  legalActions: ActionType[];
  bounds: ActionBounds;
  equity: number; // 0-1 villain equity vs random hero range
  potOdds: number; // 0-1
  tells: TellVector | null;
  personaId: string;
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

// ---------- Session / Reveal ----------

export interface SessionLogEntry {
  t: number;
  kind: "hand_start" | "hero_action" | "villain_decision" | "tells" | "context_update" | "transcript" | "hand_end";
  data: unknown;
}

export interface Session {
  id: string;
  railCode: string;
  personaId: string;
  startedAt: number;
  endedAt?: number;
  baseline?: BaselineStats;
  log: SessionLogEntry[];
}

// ---------- Rail ----------

export type RailEvent =
  | { type: "hello"; sessionId: string; personaId: string }
  | { type: "hand"; hand: Omit<HandState, "deck"> }
  | { type: "tells"; frame: TellFrame; vector?: TellVector }
  | { type: "hero_action"; action: Action }
  | { type: "villain"; decision: VillainDecision }
  | { type: "transcript"; role: "hero" | "villain"; text: string }
  | { type: "ended"; sessionId: string };
