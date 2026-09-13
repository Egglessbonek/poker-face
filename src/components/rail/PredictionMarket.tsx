"use client";

import { useMemo, useState } from "react";
import { ExternalLink, LoaderCircle, Radio, Trophy, Wallet, Zap } from "lucide-react";
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import type { PredictionMarket, PredictionSnapshot } from "@/lib/types";

interface SolanaProvider {
  publicKey?: PublicKey;
  connect: () => Promise<{ publicKey: PublicKey }>;
  signAndSendTransaction: (transaction: Transaction) => Promise<{ signature: string }>;
}

declare global {
  interface Window {
    solana?: SolanaProvider;
    phantom?: { solana?: SolanaProvider };
  }
}

const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const STAKES = [0.001, 0.005, 0.01, 0.05];

function shortWallet(wallet: string): string {
  return `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
}

function sol(lamports: number): string {
  return (lamports / LAMPORTS_PER_SOL).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function marketLabel(kind: PredictionMarket["kind"]): string {
  return { next_action: "Lightning", hand_winner: "This hand", hand_finish: "Hand finish", match_winner: "The table" }[kind];
}

async function post<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`);
  return data;
}

export default function PredictionMarketPanel({ code, snapshot }: { code: string; snapshot?: PredictionSnapshot }) {
  const [wallet, setWallet] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [stake, setStake] = useState(0.005);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const openMarkets = useMemo(() => snapshot?.markets.filter((market) => market.status === "open") ?? [], [snapshot]);
  const resolved = useMemo(() => snapshot?.markets.filter((market) => market.status === "settled" || market.status === "void").slice(0, 3) ?? [], [snapshot]);

  if (!snapshot?.enabled) return null;

  const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
  const provider = () => window.phantom?.solana ?? window.solana;
  const updateBalance = async (address: string) => {
    try {
      setBalance(await new Connection(rpc, "confirmed").getBalance(new PublicKey(address)));
    } catch {
      setBalance(null);
    }
  };
  const connect = async () => {
    setError(null);
    setMessage(null);
    const injected = provider();
    if (!injected) {
      setError("Install a Solana wallet such as Phantom to place a prediction.");
      return;
    }
    try {
      const connected = await injected.connect();
      const address = connected.publicKey.toBase58();
      setWallet(address);
      await updateBalance(address);
    } catch (reason) {
      setError((reason as Error).message || "Wallet connection was cancelled");
    }
  };

  const bet = async (market: PredictionMarket) => {
    const outcomeId = selections[market.id];
    if (!wallet || !outcomeId || !snapshot.treasury) return;
    const injected = provider();
    if (!injected) return setError("Your Solana wallet disconnected.");
    const stakeLamports = Math.round(stake * LAMPORTS_PER_SOL);
    setBusy(market.id);
    setError(null);
    setMessage(null);
    try {
      const connection = new Connection(rpc, "confirmed");
      const latest = await connection.getLatestBlockhash("confirmed");
      const memo = new TextEncoder().encode(`poker-face:${code}:${market.id}:${outcomeId}`);
      const transaction = new Transaction({ feePayer: new PublicKey(wallet), ...latest }).add(
        SystemProgram.transfer({ fromPubkey: new PublicKey(wallet), toPubkey: new PublicKey(snapshot.treasury), lamports: stakeLamports }),
        new TransactionInstruction({ keys: [], programId: MEMO_PROGRAM, data: memo as Buffer }),
      );
      const { signature } = await injected.signAndSendTransaction(transaction);
      await connection.confirmTransaction({ signature, ...latest }, "confirmed");
      await post(`/api/table/${encodeURIComponent(code)}/predictions/bet`, { marketId: market.id, outcomeId, wallet, stakeLamports, signature });
      setMessage(`Prediction placed · ${signature.slice(0, 8)}…`);
      await updateBalance(wallet);
    } catch (reason) {
      setError((reason as Error).message || "Prediction failed");
    } finally {
      setBusy(null);
    }
  };

  const claim = async () => {
    if (!wallet) return;
    setBusy("claim");
    setError(null);
    setMessage(null);
    try {
      const result = await post<{ signature: string; amountLamports: number }>(`/api/table/${encodeURIComponent(code)}/predictions/claim`, { wallet });
      setMessage(`◎${sol(result.amountLamports)} paid to your wallet`);
      await updateBalance(wallet);
    } catch (reason) {
      setError((reason as Error).message || "Claim failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-violet-400/20 bg-[linear-gradient(145deg,rgba(91,33,182,0.16),rgba(12,18,16,0.96)_58%)] text-white" aria-labelledby="prediction-market-title">
      <header className="flex items-start justify-between gap-3 border-b border-white/8 px-4 py-3.5">
        <div>
          <p className="flex items-center gap-1.5 text-[10px] font-semibold text-violet-300"><Zap size={11} fill="currentColor" /> Solana speed market</p>
          <h2 id="prediction-market-title" className="mt-1 text-sm font-semibold">Predict the action</h2>
          <p className="mt-0.5 text-[10px] text-white/40">Spectating is free · stakes settle on devnet</p>
        </div>
        <span className="flex items-center gap-1 rounded-full border border-violet-300/20 bg-violet-300/8 px-2 py-1 text-[9px] font-semibold text-violet-200"><Radio size={9} /> Live</span>
      </header>

      <div className="max-h-[48vh] space-y-3 overflow-y-auto p-3 xl:max-h-[43vh]">
        {!snapshot.bettingReady && (
          <div className="rounded-xl border border-amber-300/20 bg-amber-300/8 p-3 text-[11px] leading-relaxed text-amber-100/75">
            Markets are live in watch-only mode. Add the Solana treasury variables on the server to accept devnet stakes.
          </div>
        )}

        {openMarkets.map((market) => {
          const selected = selections[market.id];
          return (
            <article key={market.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="flex items-center justify-between gap-2 text-[9px] font-semibold text-white/35"><span>{marketLabel(market.kind)}</span><span>Pool ◎{sol(market.totalPoolLamports)}</span></div>
              <h3 className="mt-1.5 text-xs font-semibold leading-snug">{market.question}</h3>
              <div className="mt-2 grid gap-1.5">
                {market.outcomes.map((outcome) => {
                  const active = selected === outcome.id;
                  const multiplier = outcome.poolLamports > 0 ? market.totalPoolLamports * (1 - snapshot.feeBps / 10_000) / outcome.poolLamports : null;
                  return (
                    <button key={outcome.id} type="button" disabled={!snapshot.bettingReady || busy !== null} onClick={() => setSelections((current) => ({ ...current, [market.id]: outcome.id }))} className={`flex items-center justify-between gap-3 rounded-lg border px-2.5 py-2 text-left text-[11px] transition ${active ? "border-violet-300/60 bg-violet-300/12 text-white" : "border-white/8 bg-white/[0.025] text-white/65 hover:border-white/20"} disabled:cursor-not-allowed disabled:opacity-55`}>
                      <span>{outcome.label}</span><span className="font-mono text-[9px] text-violet-200">{multiplier ? `${multiplier.toFixed(2)}×` : "new pool"}</span>
                    </button>
                  );
                })}
              </div>
              {selected && snapshot.bettingReady && (
                <div className="mt-2.5">
                  <div className="mb-2 flex gap-1">{STAKES.map((amount) => <button key={amount} type="button" onClick={() => setStake(amount)} className={`flex-1 rounded-md border py-1 font-mono text-[9px] ${stake === amount ? "border-violet-300/60 bg-violet-300/15 text-violet-100" : "border-white/8 text-white/35"}`}>{amount}</button>)}</div>
                  {wallet ? (
                    <button type="button" disabled={busy !== null} onClick={() => void bet(market)} className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-violet-300 px-3 py-2 text-[11px] font-semibold text-violet-950 disabled:opacity-50">{busy === market.id ? <LoaderCircle size={12} className="animate-spin" /> : <Zap size={12} />} Stake ◎{stake}</button>
                  ) : (
                    <button type="button" onClick={() => void connect()} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-violet-300/35 px-3 py-2 text-[11px] font-semibold text-violet-200"><Wallet size={12} /> Connect wallet to predict</button>
                  )}
                </div>
              )}
            </article>
          );
        })}

        {!openMarkets.length && <p className="rounded-xl border border-white/8 bg-white/[0.025] px-3 py-4 text-center text-[11px] text-white/40">The next market opens when the action starts.</p>}

        {resolved.length > 0 && (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[9px] font-semibold text-white/30"><Trophy size={10} /> Settled</p>
            {resolved.map((market) => {
              const winner = market.outcomes.find((outcome) => outcome.id === market.winningOutcomeId);
              return <div key={market.id} className="flex items-center justify-between gap-3 border-t border-white/6 py-1.5 text-[10px] text-white/45"><span className="truncate">{market.question}</span><span className={market.status === "void" ? "text-white/35" : "text-emerald-300"}>{market.status === "void" ? "Void" : winner?.label}</span></div>;
            })}
          </div>
        )}
      </div>

      <footer className="border-t border-white/8 px-3 py-2.5">
        {wallet ? (
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[9px] text-white/40">{shortWallet(wallet)}{balance !== null ? ` · ◎${sol(balance)}` : ""}</span>
            <button type="button" disabled={busy !== null} onClick={() => void claim()} className="flex items-center gap-1 text-[10px] font-semibold text-violet-200 disabled:opacity-50">{busy === "claim" && <LoaderCircle size={10} className="animate-spin" />} Claim winnings</button>
          </div>
        ) : snapshot.bettingReady ? (
          <button type="button" onClick={() => void connect()} className="flex w-full items-center justify-center gap-1.5 text-[10px] font-semibold text-violet-200"><Wallet size={11} /> Connect Solana wallet</button>
        ) : <span className="block text-center text-[9px] text-white/25">Devnet · pari-mutuel · 5% fee</span>}
        {message && <p className="mt-2 text-[10px] text-emerald-300">{message}</p>}
        {error && <p role="alert" className="mt-2 text-[10px] leading-relaxed text-rose-300">{error}</p>}
        {message?.includes("placed") && <a href="https://explorer.solana.com/?cluster=devnet" target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[9px] text-white/35 hover:text-violet-200">Open Solana Explorer <ExternalLink size={9} /></a>}
      </footer>
    </section>
  );
}
