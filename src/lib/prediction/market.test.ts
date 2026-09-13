import { afterEach, describe, expect, it, vi } from "vitest";
import { Keypair } from "@solana/web3.js";
import { predictionResults } from "./market";

vi.mock("server-only", () => ({}));

interface TestBook {
  enabled: boolean;
  markets: Map<string, unknown>;
  recentActivity: unknown[];
}

const predictionBooks = (globalThis as unknown as { __predictionBooks: Map<string, TestBook> }).__predictionBooks;

afterEach(() => predictionBooks.clear());

describe("predictionResults", () => {
  it("summarizes public pools and one wallet's paid return", () => {
    const winner = Keypair.generate().publicKey.toBase58();
    const loser = Keypair.generate().publicKey.toBase58();
    predictionBooks.set("TEST", {
      enabled: true,
      recentActivity: [],
      markets: new Map([["market-1", {
        id: "market-1",
        kind: "next_action",
        question: "What happens next?",
        status: "settled",
        createdAt: 1,
        lockedAt: 2,
        totalPoolLamports: 3_000_000,
        winningOutcomeId: "win",
        resolvedOutcomeId: "win",
        outcomes: [
          { id: "win", label: "Win", poolLamports: 1_000_000 },
          { id: "lose", label: "Lose", poolLamports: 2_000_000 },
        ],
        bets: [
          { id: "bet-1", marketId: "market-1", outcomeId: "win", wallet: winner, stakeLamports: 1_000_000, signature: "deposit-1", placedAt: 1, payoutLamports: 2_850_000, claimed: true, claimSignature: "payout-1" },
          { id: "bet-2", marketId: "market-1", outcomeId: "lose", wallet: loser, stakeLamports: 2_000_000, signature: "deposit-2", placedAt: 1, payoutLamports: 0, claimed: false },
        ],
      }]]),
    });

    const results = predictionResults("TEST", winner);

    expect(results.complete).toBe(true);
    expect(results.totals).toMatchObject({ markets: 1, bets: 2, bettors: 2, stakedLamports: 3_000_000, returnedLamports: 2_850_000, paidLamports: 2_850_000, feeLamports: 150_000 });
    expect(results.wallet).toMatchObject({ address: winner, stakedLamports: 1_000_000, returnedLamports: 2_850_000, paidLamports: 2_850_000, pendingLamports: 0, netLamports: 1_850_000 });
    expect(results.wallet?.bets[0]).toMatchObject({ result: "won", payoutSignature: "payout-1", depositSignature: "deposit-1" });
  });
});
