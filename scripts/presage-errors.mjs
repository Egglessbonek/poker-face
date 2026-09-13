// kError ends a native pipeline. A fresh process can recover transport/processing
// failures; account/configuration failures need intervention. usePresage bounds retries.
const messages = new Map([
  [1, 'Camera processing lost its session.'],
  [2, 'Presage authentication failed. Check the server key.'],
  [3, 'Presage could not configure pulse and breathing. Check the server runtime and metric access.'],
  [4, 'Presage credits are exhausted. Refill the account to resume measurements.'],
  [5, 'The connection to Presage was interrupted.'],
  [6, 'Presage is temporarily unavailable.'],
  [7, 'Presage stopped receiving camera frames.'],
  [8, 'Presage camera processing was interrupted.'],
  [9, 'Presage could not process a camera frame.'],
  [10, 'Camera frame timing changed.'],
  [11, 'Camera frames were interrupted.'],
]);

/** @param {{code?: number, message?: string, retryable?: boolean}} error */
export function describePresageError(error) {
  const code = Number.isInteger(error.code) ? error.code : null;
  const terminal = code === 2 || code === 3 || code === 4;
  return {
    code,
    message: messages.get(code) ?? 'Presage could not start camera processing. Check the server runtime.',
    retryable: !terminal && (error.retryable === true || (code !== null && messages.has(code))),
  };
}

/** Raw SDK details are for server logs only; never forward credentials. */
export function redactPresageDetail(message, key = '') {
  return String(message ?? 'No SDK detail supplied')
    .split(key || '__no_presage_key__').join('[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/([?&](?:api[_-]?key|token|key)=)[^&\s]+/gi, '$1[redacted]')
    .slice(0, 2000);
}
