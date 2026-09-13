/** Deterministic integer-lamport pari-mutuel split. Rounding dust remains in the treasury. */
export function pariMutuelPayouts(totalPool: number, winningStakes: number[], feeBps: number): number[] {
  const winningPool = winningStakes.reduce((sum, stake) => sum + stake, 0);
  if (winningPool <= 0) return winningStakes.map(() => 0);
  const distributable = Math.floor(totalPool * (10_000 - feeBps) / 10_000);
  return winningStakes.map((stake) => Math.floor(distributable * stake / winningPool));
}
