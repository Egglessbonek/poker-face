"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CircleDollarSign, ExternalLink, LoaderCircle, RotateCw, Wallet } from "lucide-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { rememberSolanaWallet, rememberedSolanaWallet, solanaProvider } from "@/lib/client/solanaWallet";
import type { PredictionBetResult, PredictionResults as Results } from "@/lib/types";

function sol(lamports: number): string {
  return (lamports / LAMPORTS_PER_SOL).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function shortWallet(wallet: string): string {
  return `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
}

function explorer(signature: string): string {
  return `https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=devnet`;
}

function resultTone(result: PredictionBetResult["result"]): string {
  if (result === "won") return "text-emerald-300";
  if (result === "refunded") return "text-amber-200";
  if (result === "lost") return "text-rose-300";
  return "text-white/45";
}

export default function PredictionResults({ code }: { code: string }) {
  const [wallet, setWallet] = useState<string | null>(() => typeof window === "undefined" ? null : rememberedSolanaWallet());
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const visibleWalletBets = results?.wallet?.bets.filter((bet) => bet.result !== "refunded") ?? [];
  const visibleMarkets = results?.markets.filter((market) => market.status !== "void") ?? [];

  const load = useCallback(async (address?: string | null) => {
    const suffix = address ? `?wallet=${encodeURIComponent(address)}` : "";
    try {
      const response = await fetch(`/api/table/${encodeURIComponent(code)}/predictions/results${suffix}`, { cache: "no-store" });
      const data = await response.json() as Results & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Prediction results are unavailable");
      setResults(data);
      setError(null);
    } catch (reason) {
      setError((reason as Error).message || "Prediction results are unavailable");
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    const first = window.setTimeout(() => void load(wallet), 0);
    const timer = window.setInterval(() => void load(wallet), 2_500);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [load, wallet]);

  const connect = async () => {
    setConnecting(true);
    setError(null);
    try {
      const provider = solanaProvider();
      if (!provider) throw new Error("Install a Solana wallet such as Phantom to see your bets.");
      const connected = await provider.connect();
      const address = connected.publicKey.toBase58();
      rememberSolanaWallet(address);
      setWallet(address);
      await load(address);
    } catch (reason) {
      setError((reason as Error).message || "Wallet connection was cancelled");
    } finally {
      setConnecting(false);
    }
  };

  if (loading && !results) {
    return <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#14241d_0%,#0b0f0d_42%)]"><LoaderCircle className="animate-spin text-gold" size={28} /></main>;
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#14241d_0%,#0b0f0d_42%)] px-4 py-6 text-white sm:px-6 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <p className="text-sm font-semibold text-gold">Poker Face · Prediction results</p>
            <h1 className="mt-1 text-3xl font-semibold">Table <span className="font-mono text-gold">{code}</span></h1>
            <p className="mt-1 text-sm text-white/45">Final markets, wallet returns, and automatic devnet payouts.</p>
          </div>
          <div className="flex gap-2">
            <Link href={`/rail/${code}?stay=1`} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-white/60 hover:border-gold/35 hover:text-gold"><ArrowLeft size={14} /> Rail</Link>
            <Link href="/" className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/60 hover:border-gold/35 hover:text-gold">Home</Link>
          </div>
        </header>

        {error && <p role="alert" className="mt-4 rounded-xl border border-rose-300/20 bg-rose-300/8 px-4 py-3 text-sm text-rose-200">{error}</p>}

        {!results?.enabled ? (
          <section className="mt-8 rounded-3xl border border-white/10 bg-white/[0.035] p-8 text-center">
            <CircleDollarSign className="mx-auto text-white/25" size={32} />
            <h2 className="mt-3 text-xl font-semibold">Predictions were not enabled</h2>
            <p className="mt-2 text-sm text-white/45">This table did not run a Solana speed market.</p>
          </section>
        ) : results && (
          <>
            <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Prediction totals">
              <Total label="Total wagered" value={`◎${sol(results.totals.stakedLamports)}`} />
              <Total label="Returned to bettors" value={`◎${sol(results.totals.returnedLamports)}`} />
              <Total label="Bettors" value={String(results.totals.bettors)} />
              <Total label="Markets" value={String(results.totals.markets)} />
            </section>

            <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
              <section className="rounded-3xl border border-white/10 bg-[#0c1210]/95 p-5 sm:p-6" aria-labelledby="market-results-title">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 id="market-results-title" className="text-xl font-semibold">Market results</h2>
                  <span className={`rounded-full border px-2.5 py-1 text-xs ${results.complete ? "border-emerald-300/20 bg-emerald-300/8 text-emerald-300" : "border-amber-300/20 bg-amber-300/8 text-amber-200"}`}>{results.complete ? "Final" : "Settling"}</span>
                </div>
                <div className="divide-y divide-white/8">
                  {visibleMarkets.map((market) => {
                    const winner = market.outcomes.find((outcome) => outcome.id === market.winningOutcomeId);
                    return (
                      <article key={market.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-white/85">{market.question}</p>
                          <p className="mt-0.5 text-xs text-white/35">{market.betCount} {market.betCount === 1 ? "bet" : "bets"} · Pool ◎{sol(market.totalPoolLamports)}</p>
                        </div>
                        <span className={`text-sm ${market.status === "void" ? "text-amber-200" : market.status === "settled" ? "text-emerald-300" : "text-white/40"}`}>{market.status === "void" ? "Refunded" : winner?.label ?? "Pending"}</span>
                      </article>
                    );
                  })}
                  {!visibleMarkets.length && <p className="py-8 text-center text-sm text-white/40">No settled markets to show.</p>}
                </div>
              </section>

              <aside className="space-y-4">
                <section className="rounded-3xl border border-violet-300/20 bg-violet-300/[0.055] p-5">
                  <div className="flex items-center gap-2 text-violet-200"><Wallet size={17} /><h2 className="font-semibold">Your wallet</h2></div>
                  {!wallet ? (
                    <>
                      <p className="mt-3 text-sm leading-relaxed text-white/45">Connect the wallet used to bet to see its complete result.</p>
                      <button type="button" disabled={connecting} onClick={() => void connect()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-300 px-4 py-2.5 text-sm font-semibold text-violet-950 disabled:opacity-50">{connecting ? <LoaderCircle className="animate-spin" size={15} /> : <Wallet size={15} />} Connect wallet</button>
                    </>
                  ) : results.wallet ? (
                    <>
                      <p className="mt-2 font-mono text-xs text-white/40">{shortWallet(wallet)}</p>
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <WalletTotal label="Wagered" value={`◎${sol(results.wallet.stakedLamports)}`} />
                        <WalletTotal label="Returned" value={`◎${sol(results.wallet.returnedLamports)}`} />
                        <WalletTotal label="Paid" value={`◎${sol(results.wallet.paidLamports)}`} />
                        <WalletTotal label="Net result" value={`${results.wallet.netLamports >= 0 ? "+" : "−"}◎${sol(Math.abs(results.wallet.netLamports))}`} tone={results.wallet.netLamports >= 0 ? "text-emerald-300" : "text-rose-300"} />
                      </div>
                      {results.wallet.pendingLamports > 0 && <p className="mt-3 flex items-center gap-2 text-xs text-amber-200"><RotateCw className="animate-spin" size={12} /> Automatic payout pending · ◎{sol(results.wallet.pendingLamports)}</p>}
                      {!visibleWalletBets.length && <p className="mt-3 text-sm text-white/45">No settled bets to show for this wallet.</p>}
                    </>
                  ) : null}
                </section>

                {visibleWalletBets.map((bet) => (
                  <article key={bet.id} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div><p className="text-xs text-white/35">{bet.marketQuestion}</p><p className="mt-1 text-sm font-medium">{bet.outcomeLabel}</p></div>
                      <span className={`text-xs font-semibold ${resultTone(bet.result)}`}>{bet.result === "won" ? "Won" : bet.result === "lost" ? "Lost" : bet.result === "refunded" ? "Refunded" : "Pending"}</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-white/45"><span>Stake ◎{sol(bet.stakeLamports)}</span><span>Return ◎{sol(bet.payoutLamports)}</span></div>
                    <div className="mt-3 flex gap-3 text-xs">
                      <a href={explorer(bet.depositSignature)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-violet-200 hover:text-violet-100">Deposit <ExternalLink size={10} /></a>
                      {bet.payoutSignature && <a href={explorer(bet.payoutSignature)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-300 hover:text-emerald-200">Payout <ExternalLink size={10} /></a>}
                    </div>
                  </article>
                ))}
              </aside>
            </div>

            <p className="mt-6 text-center text-xs text-white/25">Devnet only · centralized pari-mutuel settlement · 5% fee on settled pools</p>
          </>
        )}
      </div>
    </main>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><p className="text-xs text-white/40">{label}</p><p className="mt-1 font-mono text-xl text-white">{value}</p></div>;
}

function WalletTotal({ label, value, tone = "text-white" }: { label: string; value: string; tone?: string }) {
  return <div className="rounded-xl border border-white/8 bg-black/15 p-3"><p className="text-[10px] text-white/35">{label}</p><p className={`mt-1 font-mono text-sm ${tone}`}>{value}</p></div>;
}
