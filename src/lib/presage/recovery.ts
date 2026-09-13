export class MeasurementError extends Error {
  constructor(message: string, public retryable: boolean) { super(message); }
}

export function canRecover(error: unknown): boolean {
  return error instanceof MeasurementError ? error.retryable : error instanceof Error && (error.name === "TypeError" || error.name === "TimeoutError");
}

/** Connection failures can restart capture, never poor-confidence/missing estimates. */
export function createRecoveryBudget() {
  const failures: number[] = [];
  return (retryable: boolean, now = Date.now()): number | null => {
    if (!retryable) return null;
    while (failures.length && now - failures[0] >= 60_000) failures.shift();
    if (failures.length >= 2) return null;
    failures.push(now);
    return failures.length === 1 ? 2000 : 5000;
  };
}
