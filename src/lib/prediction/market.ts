/**
 * Server-owned prediction books for the rail. Stakes and claims are real Solana devnet transfers;
 * market creation, locking and settlement follow the authoritative poker engine.
 *
 * Like tables, this is intentionally globalThis-backed for the app's single-process deployment.
 * A production mainnet launch should replace this store with durable storage and an audited program.
 */

import "server-only";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  type ParsedInstruction,
  type ParsedTransactionWithMeta,
} from "@solana/web3.js";
import { publish } from "@/lib/realtime/bus";
import { pariMutuelPayouts } from "@/lib/prediction/payouts";
import type {
  ActionType,
  Player,
  PredictionActivity,
  PredictionBetReceipt,
  PredictionMarket,
  PredictionMarketKind,
  PredictionResults,
  PredictionSnapshot,
} from "@/lib/types";

const MIN_STAKE_LAMPORTS = 1_000_000; // 0.001 SOL
const MAX_STAKE_LAMPORTS = 100_000_000; // 0.1 SOL on devnet
const FEE_BPS = 500;
const LATE_CONFIRMATION_MS = 12_000;
const AUTOMATIC_PAYOUT_RETRIES = 3;
const AUTOMATIC_PAYOUT_RETRY_MS = 2_500;
const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

interface StoredBet extends PredictionBetReceipt {
  payoutLamports?: number;
  claimed: boolean;
}

interface StoredMarket extends PredictionMarket {
  bets: StoredBet[];
  resolvedOutcomeId?: string;
  claimableAt?: number;
}

interface PredictionBook {
  enabled: boolean;
  markets: Map<string, StoredMarket>;
  recentActivity: PredictionActivity[];
}

interface BetInput {
  marketId: string;
  outcomeId: string;
  wallet: string;
  stakeLamports: number;
  signature: string;
}

const globals = globalThis as unknown as {
  __predictionBooks?: Map<string, PredictionBook>;
  __predictionSignatures?: Set<string>;
  __predictionPendingSignatures?: Set<string>;
  __predictionPendingVerifications?: Map<string, number>;
};
const books = (globals.__predictionBooks ??= new Map());
const usedSignatures = (globals.__predictionSignatures ??= new Set());
const pendingSignatures = (globals.__predictionPendingSignatures ??= new Set());
const pendingVerifications = (globals.__predictionPendingVerifications ??= new Map());

export class PredictionError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function bookFor(code: string): PredictionBook {
  let book = books.get(code);
  if (!book) {
    book = { enabled: false, markets: new Map(), recentActivity: [] };
    books.set(code, book);
  }
  return book;
}

function treasury(): Keypair | null {
  const raw = process.env.SOLANA_TREASURY_SECRET_KEY?.trim();
  if (!raw) return null;
  try {
    const values = JSON.parse(raw) as number[];
    if (!Array.isArray(values) || values.length !== 64) return null;
    const keypair = Keypair.fromSecretKey(Uint8Array.from(values));
    const expected = process.env.SOLANA_TREASURY_PUBLIC_KEY?.trim();
    if (expected && keypair.publicKey.toBase58() !== expected) return null;
    return keypair;
  } catch {
    return null;
  }
}

function connection(): Connection {
  return new Connection(process.env.SOLANA_RPC_URL ?? process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com", "confirmed");
}

function publicMarket(market: StoredMarket): PredictionMarket {
  const { bets: _bets, resolvedOutcomeId: _resolved, claimableAt: _claimable, ...visible } = market;
  void _bets;
  void _resolved;
  void _claimable;
  return {
    ...visible,
    outcomes: visible.outcomes.map((outcome) => ({ ...outcome })),
  };
}

export function predictionSnapshot(code: string): PredictionSnapshot {
  const book = bookFor(code);
  const signer = treasury();
  const markets = [...book.markets.values()]
    .sort((a, b) => Number(b.status === "open") - Number(a.status === "open") || b.createdAt - a.createdAt)
    .slice(0, 16)
    .map(publicMarket);
  return {
    enabled: book.enabled,
    bettingReady: !!signer,
    cluster: "devnet",
    treasury: signer?.publicKey.toBase58(),
    markets,
    recentActivity: book.recentActivity.slice(-12).map((activity) => ({ ...activity })),
    minStakeLamports: MIN_STAKE_LAMPORTS,
    maxStakeLamports: MAX_STAKE_LAMPORTS,
    feeBps: FEE_BPS,
  };
}

export function predictionResults(code: string, wallet?: string): PredictionResults {
  const book = bookFor(code);
  const storedMarkets = [...book.markets.values()].sort((a, b) => b.createdAt - a.createdAt);
  const allBets = storedMarkets.flatMap((market) => market.bets.map((bet) => ({ market, bet })));
  const returnedLamports = allBets.reduce((sum, { bet }) => sum + (bet.payoutLamports ?? 0), 0);
  const paidLamports = allBets.reduce((sum, { bet }) => sum + (bet.claimSignature ? (bet.payoutLamports ?? 0) : 0), 0);
  const settledStake = allBets.reduce((sum, { market, bet }) => sum + (market.status === "settled" || market.status === "void" ? bet.stakeLamports : 0), 0);
  const result: PredictionResults = {
    code,
    enabled: book.enabled,
    complete: storedMarkets.length > 0 && storedMarkets.every((market) => market.status === "settled" || market.status === "void"),
    cluster: "devnet",
    totals: {
      markets: storedMarkets.length,
      bets: allBets.length,
      bettors: new Set(allBets.map(({ bet }) => bet.wallet)).size,
      stakedLamports: allBets.reduce((sum, { bet }) => sum + bet.stakeLamports, 0),
      returnedLamports,
      paidLamports,
      feeLamports: Math.max(0, settledStake - returnedLamports),
    },
    markets: storedMarkets.map((market) => ({ ...publicMarket(market), betCount: market.bets.length })),
  };

  if (!wallet) return result;
  let normalizedWallet: string;
  try {
    normalizedWallet = new PublicKey(wallet).toBase58();
  } catch {
    throw new PredictionError("Invalid Solana wallet");
  }
  const walletBets = allBets.filter(({ bet }) => bet.wallet === normalizedWallet);
  const walletReturned = walletBets.reduce((sum, { bet }) => sum + (bet.payoutLamports ?? 0), 0);
  const walletPaid = walletBets.reduce((sum, { bet }) => sum + (bet.claimSignature ? (bet.payoutLamports ?? 0) : 0), 0);
  const walletStaked = walletBets.reduce((sum, { bet }) => sum + bet.stakeLamports, 0);
  result.wallet = {
    address: normalizedWallet,
    stakedLamports: walletStaked,
    returnedLamports: walletReturned,
    paidLamports: walletPaid,
    pendingLamports: walletReturned - walletPaid,
    netLamports: walletReturned - walletStaked,
    bets: walletBets.map(({ market, bet }) => {
      const selected = market.outcomes.find((outcome) => outcome.id === bet.outcomeId);
      const winning = market.outcomes.find((outcome) => outcome.id === market.winningOutcomeId);
      const payout = bet.payoutLamports ?? 0;
      const betResult = market.status === "open" || market.status === "locked"
        ? "pending"
        : market.status === "void"
          ? "refunded"
          : payout > 0 ? "won" : "lost";
      return {
        id: bet.id,
        marketId: market.id,
        marketQuestion: market.question,
        outcomeLabel: selected?.label ?? bet.outcomeId,
        winningOutcomeLabel: winning?.label,
        stakeLamports: bet.stakeLamports,
        payoutLamports: payout,
        result: betResult,
        placedAt: bet.placedAt,
        depositSignature: bet.signature,
        payoutSignature: bet.claimSignature,
      };
    }),
  };
  return result;
}

function broadcast(code: string): void {
  publish(code, { type: "prediction_state", predictions: predictionSnapshot(code) });
}

export function configurePredictionTable(code: string, enabled: boolean): void {
  const book = bookFor(code);
  book.enabled = enabled;
  if (!enabled) {
    for (const market of book.markets.values()) if (market.status === "open") voidMarket(code, market);
  }
  broadcast(code);
}

function addMarket(code: string, input: { id: string; kind: PredictionMarketKind; question: string; handNumber?: number; outcomes: Array<{ id: string; label: string; playerId?: string }> }): void {
  const book = bookFor(code);
  if (!book.enabled || book.markets.has(input.id)) return;
  book.markets.set(input.id, {
    ...input,
    status: "open",
    createdAt: Date.now(),
    totalPoolLamports: 0,
    outcomes: input.outcomes.map((outcome) => ({ ...outcome, poolLamports: 0 })),
    bets: [],
  });
}

export function startPredictionMatch(code: string, players: Player[]): void {
  addMarket(code, {
    id: "match-winner",
    kind: "match_winner",
    question: "Who wins the table?",
    outcomes: players.map((player) => ({ id: player.id, label: player.name, playerId: player.id })),
  });
  broadcast(code);
}

export function startPredictionHand(code: string, handNumber: number, players: Player[]): void {
  addMarket(code, {
    id: `hand-${handNumber}-winner`,
    kind: "hand_winner",
    question: `Who takes the most chips in hand ${handNumber}?`,
    handNumber,
    outcomes: players.map((player) => ({ id: player.id, label: player.name, playerId: player.id })),
  });
  addMarket(code, {
    id: `hand-${handNumber}-finish`,
    kind: "hand_finish",
    question: "How does this hand end?",
    handNumber,
    outcomes: [{ id: "fold", label: "Everyone folds" }, { id: "showdown", label: "Showdown" }],
  });
  broadcast(code);
}

export function openNextActionPrediction(code: string, handNumber: number, actionNumber: number, player: Player | undefined): void {
  if (!player) return;
  addMarket(code, {
    id: `hand-${handNumber}-action-${actionNumber}`,
    kind: "next_action",
    question: `What will ${player.name} do next?`,
    handNumber,
    outcomes: [
      { id: "fold", label: "Fold" },
      { id: "passive", label: "Check / call" },
      { id: "aggressive", label: "Bet / raise" },
    ],
  });
  broadcast(code);
}

function nextActionOutcome(action: ActionType): string {
  if (action === "fold") return "fold";
  if (action === "bet" || action === "raise" || action === "allin") return "aggressive";
  return "passive";
}

export function settleNextActionPrediction(code: string, handNumber: number, actionNumber: number, action: ActionType): void {
  settleMarket(code, bookFor(code).markets.get(`hand-${handNumber}-action-${actionNumber}`), nextActionOutcome(action));
  broadcast(code);
}

export function settlePredictionHand(code: string, handNumber: number, winners: string[], foldedOut: boolean): void {
  const uniqueWinners = [...new Set(winners)];
  const winnerMarket = bookFor(code).markets.get(`hand-${handNumber}-winner`);
  if (uniqueWinners.length === 1) settleMarket(code, winnerMarket, uniqueWinners[0]);
  else if (winnerMarket) voidMarket(code, winnerMarket);
  settleMarket(code, bookFor(code).markets.get(`hand-${handNumber}-finish`), foldedOut ? "fold" : "showdown");
  broadcast(code);
}

export function finishPredictionMatch(code: string, winnerIds: string[]): void {
  const book = bookFor(code);
  for (const market of book.markets.values()) {
    if (market.status !== "open" || market.id === "match-winner") continue;
    voidMarket(code, market);
  }
  const winners = [...new Set(winnerIds)];
  const match = book.markets.get("match-winner");
  if (winners.length === 1) settleMarket(code, match, winners[0]);
  else if (match) voidMarket(code, match);
  broadcast(code);
}

function settleMarket(code: string, market: StoredMarket | undefined, outcomeId: string): void {
  if (!market || market.status !== "open") return;
  market.status = "locked";
  market.lockedAt = Date.now();
  market.resolvedOutcomeId = outcomeId;
  recalculatePayouts(market);
  scheduleAutomaticPayout(code, market.claimableAt);
}

function voidMarket(code: string, market: StoredMarket): void {
  if (market.status !== "open" && market.status !== "locked") return;
  market.status = "void";
  market.lockedAt ??= Date.now();
  market.claimableAt = Date.now() + LATE_CONFIRMATION_MS;
  for (const bet of market.bets) bet.payoutLamports = bet.stakeLamports;
  scheduleAutomaticPayout(code, market.claimableAt);
}

function recalculatePayouts(market: StoredMarket): void {
  const outcomeId = market.resolvedOutcomeId;
  const winners = market.bets.filter((bet) => bet.outcomeId === outcomeId);
  market.winningOutcomeId = outcomeId;
  market.claimableAt = Date.now() + LATE_CONFIRMATION_MS;
  if (!winners.length) {
    market.status = "void";
    for (const bet of market.bets) bet.payoutLamports = bet.stakeLamports;
    return;
  }
  market.status = "settled";
  const payouts = pariMutuelPayouts(market.totalPoolLamports, winners.map((bet) => bet.stakeLamports), FEE_BPS);
  let winnerIndex = 0;
  for (const bet of market.bets) bet.payoutLamports = bet.outcomeId === outcomeId ? payouts[winnerIndex++] : 0;
}

function parsedSystemTransfer(tx: ParsedTransactionWithMeta, source: string, destination: string, lamports: number): boolean {
  return tx.transaction.message.instructions.some((instruction) => {
    if (!("parsed" in instruction)) return false;
    const parsed = instruction as ParsedInstruction;
    if (parsed.program !== "system" || parsed.parsed?.type !== "transfer") return false;
    const info = parsed.parsed.info as { source?: string; destination?: string; lamports?: number };
    return info.source === source && info.destination === destination && Number(info.lamports) === lamports;
  });
}

function parsedMemo(tx: ParsedTransactionWithMeta, expected: string): boolean {
  return tx.transaction.message.instructions.some((instruction) => {
    if (!("parsed" in instruction) || instruction.programId.toBase58() !== MEMO_PROGRAM_ID) return false;
    const parsed = (instruction as ParsedInstruction).parsed as unknown;
    if (typeof parsed === "string") return parsed === expected;
    if (!parsed || typeof parsed !== "object") return false;
    const value = parsed as { memo?: unknown; info?: { memo?: unknown } };
    return value.memo === expected || value.info?.memo === expected;
  });
}

async function confirmedTransaction(signature: string): Promise<ParsedTransactionWithMeta> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const tx = await connection().getParsedTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    if (tx) return tx;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new PredictionError("Solana transaction is not confirmed yet", 409);
}

export async function placePredictionBet(code: string, input: BetInput): Promise<PredictionBetReceipt> {
  const receivedAt = Date.now();
  const book = bookFor(code);
  if (!book.enabled) throw new PredictionError("Predictions are not enabled at this table", 403);
  const signer = treasury();
  if (!signer) throw new PredictionError("This table is in watch-only mode because its Solana treasury is not configured", 503);
  const market = book.markets.get(input.marketId);
  if (!market) throw new PredictionError("That market does not exist", 404);
  const amount = Math.round(Number(input.stakeLamports));
  if (!Number.isSafeInteger(amount) || amount < MIN_STAKE_LAMPORTS || amount > MAX_STAKE_LAMPORTS) throw new PredictionError("Stake is outside the table limits");
  if (!market.outcomes.some((outcome) => outcome.id === input.outcomeId)) throw new PredictionError("That outcome does not exist");
  if (market.status !== "open" && !market.lockedAt) throw new PredictionError("That market is closed", 409);
  try {
    new PublicKey(input.wallet);
  } catch {
    throw new PredictionError("Invalid Solana wallet");
  }
  if (!input.signature || usedSignatures.has(input.signature) || pendingSignatures.has(input.signature)) throw new PredictionError("Transaction signature was already used", 409);
  if (market.claimableAt && receivedAt > market.claimableAt) throw new PredictionError("That market no longer accepts confirmed bets", 409);

  pendingSignatures.add(input.signature);
  pendingVerifications.set(code, (pendingVerifications.get(code) ?? 0) + 1);
  try {
    const tx = await confirmedTransaction(input.signature);
    if (tx.meta?.err) throw new PredictionError("Solana transaction failed", 402);
    const signedByWallet = tx.transaction.message.accountKeys.some((key) => key.pubkey.toBase58() === input.wallet && key.signer);
    const expectedMemo = `poker-face:${code}:${market.id}:${input.outcomeId}`;
    if (!signedByWallet || !parsedSystemTransfer(tx, input.wallet, signer.publicKey.toBase58(), amount) || !parsedMemo(tx, expectedMemo)) throw new PredictionError("Transaction does not match this prediction", 402);
    const confirmedAt = (tx.blockTime ?? 0) * 1000;
    if (!confirmedAt || confirmedAt + 5_000 < market.createdAt) throw new PredictionError("Transaction predates this market", 409);
    if (market.lockedAt && confirmedAt > market.lockedAt + 1_000) throw new PredictionError("The market locked before that transaction landed", 409);

    const outcome = market.outcomes.find((candidate) => candidate.id === input.outcomeId)!;
    const bet: StoredBet = {
      id: crypto.randomUUID(),
      marketId: market.id,
      outcomeId: outcome.id,
      wallet: input.wallet,
      stakeLamports: amount,
      signature: input.signature,
      placedAt: confirmedAt,
      claimed: false,
    };
    market.bets.push(bet);
    market.totalPoolLamports += amount;
    outcome.poolLamports += amount;
    if (market.resolvedOutcomeId) recalculatePayouts(market);
    else if (market.status === "void") bet.payoutLamports = bet.stakeLamports;
    usedSignatures.add(input.signature);
    book.recentActivity.push({ id: bet.id, marketId: market.id, outcomeLabel: outcome.label, wallet: `${input.wallet.slice(0, 4)}…${input.wallet.slice(-4)}`, stakeLamports: amount, placedAt: confirmedAt });
    book.recentActivity = book.recentActivity.slice(-20);
    broadcast(code);
    const { claimed: _claimed, ...receipt } = bet;
    void _claimed;
    return receipt;
  } finally {
    pendingSignatures.delete(input.signature);
    const remaining = (pendingVerifications.get(code) ?? 1) - 1;
    if (remaining > 0) pendingVerifications.set(code, remaining);
    else pendingVerifications.delete(code);
  }
}

function scheduleAutomaticPayout(code: string, claimableAt = Date.now()): void {
  const delay = Math.max(0, claimableAt - Date.now()) + 250;
  setTimeout(() => void payReadyWallets(code), delay);
}

async function payReadyWallets(code: string): Promise<void> {
  if ((pendingVerifications.get(code) ?? 0) > 0) {
    setTimeout(() => void payReadyWallets(code), 500);
    return;
  }
  const now = Date.now();
  const wallets = new Set(
    [...bookFor(code).markets.values()].flatMap((market) =>
      (market.claimableAt ?? Infinity) <= now
        ? market.bets.filter((bet) => !bet.claimed && (bet.payoutLamports ?? 0) > 0).map((bet) => bet.wallet)
        : [],
    ),
  );
  await Promise.all([...wallets].map((wallet) => payWalletAutomatically(code, wallet)));
}

async function payWalletAutomatically(code: string, wallet: string, attempt = 1): Promise<void> {
  try {
    await claimPredictionWinnings(code, wallet);
  } catch (error) {
    if (error instanceof PredictionError && error.status === 409) return;
    console.error(`prediction payout attempt ${attempt} failed for table ${code}`, error);
    if (attempt < AUTOMATIC_PAYOUT_RETRIES) {
      setTimeout(() => void payWalletAutomatically(code, wallet, attempt + 1), AUTOMATIC_PAYOUT_RETRY_MS * attempt);
    }
  }
}

export async function claimPredictionWinnings(code: string, wallet: string): Promise<{ signature: string; amountLamports: number }> {
  const signer = treasury();
  if (!signer) throw new PredictionError("Solana treasury is not configured", 503);
  let destination: PublicKey;
  try {
    destination = new PublicKey(wallet);
  } catch {
    throw new PredictionError("Invalid Solana wallet");
  }
  const now = Date.now();
  const bets = [...bookFor(code).markets.values()].flatMap((market) =>
    (market.claimableAt ?? Infinity) <= now
      ? market.bets.filter((bet) => bet.wallet === wallet && !bet.claimed && (bet.payoutLamports ?? 0) > 0)
      : [],
  );
  const amountLamports = bets.reduce((sum, bet) => sum + (bet.payoutLamports ?? 0), 0);
  if (!amountLamports) throw new PredictionError("No settled winnings are ready to claim", 409);
  for (const bet of bets) bet.claimed = true;
  try {
    const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: signer.publicKey, toPubkey: destination, lamports: amountLamports }));
    const signature = await connection().sendTransaction(tx, [signer], { preflightCommitment: "confirmed" });
    const confirmation = await connection().confirmTransaction(signature, "confirmed");
    if (confirmation.value.err) throw new Error("Payout transaction failed");
    for (const bet of bets) bet.claimSignature = signature;
    broadcast(code);
    return { signature, amountLamports };
  } catch (error) {
    for (const bet of bets) bet.claimed = false;
    throw new PredictionError(`Could not send payout: ${(error as Error).message}`, 502);
  }
}
