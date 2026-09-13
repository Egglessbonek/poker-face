import type { PublicKey, Transaction } from "@solana/web3.js";

export interface SolanaProvider {
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

export const SOLANA_WALLET_SESSION_KEY = "poker-face:solana-wallet";

export function solanaProvider(): SolanaProvider | undefined {
  return window.phantom?.solana ?? window.solana;
}

export function rememberSolanaWallet(wallet: string): void {
  window.sessionStorage.setItem(SOLANA_WALLET_SESSION_KEY, wallet);
}

export function rememberedSolanaWallet(): string | null {
  return window.sessionStorage.getItem(SOLANA_WALLET_SESSION_KEY);
}
