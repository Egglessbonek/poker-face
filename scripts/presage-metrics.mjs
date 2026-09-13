/** @typedef {{value?: number, confidence?: number, stable?: boolean, timestamp?: number | {toString(): string}}} SDKRate */
/** @typedef {{cardio?: {pulseRate?: SDKRate[]}, breathing?: {rate?: SDKRate[]}}} SDKMetrics */
/** @typedef {{value?: number, confidence?: number, stable?: boolean, at: number}} Rate */

// SDK callbacks may update pulse and breathing separately. Accumulate every callback
// before throttling UI delivery, retaining each metric's original source timestamp.
export function createMetricSampler(intervalMs = 1000) {
  /** @type {{pulse?: Rate, breathing?: Rate}} */
  const latest = {};
  let lastEmit = -Infinity;
  /** @param {SDKMetrics} data @param {number} timestampUs @param {number} now */
  return (data, timestampUs, now = Date.now()) => {
    /** @param {SDKRate | undefined} reading @param {'pulse' | 'breathing'} kind */
    const update = (reading, kind) => {
      if (!reading) return;
      const at = (Number(reading.timestamp) || timestampUs) / 1000;
      if (latest[kind] && at < latest[kind].at) return;
      latest[kind] = { value: reading.value, confidence: reading.confidence, stable: reading.stable, at };
    };
    update(data.cardio?.pulseRate?.at(-1), 'pulse');
    update(data.breathing?.rate?.at(-1), 'breathing');
    if (now - lastEmit < intervalMs) return null;
    lastEmit = now;
    return { type: 'sample', at: timestampUs / 1000, ...latest };
  };
}
