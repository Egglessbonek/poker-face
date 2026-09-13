// One native SDK pipeline per child. Frames are transient; stdout contains measurements/status only.
import { SmartSpectraSDK, SmartSpectraLogLevel, PixelFormat, decodeMetrics } from '@smartspectra/node-sdk';
import sharp from 'sharp';
import { createMetricSampler } from './presage-metrics.mjs';
import { describePresageError, redactPresageDetail } from './presage-errors.mjs';
import { preparePresageRuntime } from './presage-runtime.mjs';
const emit = value => process.stdout.write(JSON.stringify(value) + '\n');
let sdk, closing = false, pending = Buffer.alloc(0), pumping = false, lastTs = -1;
let validation = { code: null, hint: 'Waiting for camera measurements' };
const queue = [];
let submitted = 0, dropped = 0, intervalFrames = 0, decodeTotal = 0, sourceAgeMs = 0, statsAt = Date.now();
const statsTimer = setInterval(() => {
  const at = Date.now(), elapsed = at - statsAt;
  emit({ type: 'pipeline', stats: { at, fps: Math.round(intervalFrames * 1000 / elapsed), submitted, dropped, decodeMs: intervalFrames ? Math.round(decodeTotal / intervalFrames) : 0, sourceAgeMs, queued: queue.length } });
  intervalFrames = 0; decodeTotal = 0; statsAt = at;
}, 1000);
statsTimer.unref();
async function close(code = 0) {
  if (closing) return;
  closing = true; clearInterval(statsTimer); queue.length = 0; pending = Buffer.alloc(0);
  const deadline = setTimeout(() => process.exit(code), 3000); deadline.unref();
  try { await sdk?.destroy(); } catch { /* Process exit still releases the native pipeline. */ }
  finally { clearTimeout(deadline); process.exit(code); }
}
function fail(error, stage) {
  if (closing) return;
  const failure = describePresageError(error);
  emit({ type: 'diagnostic', ...failure, stage, detail: redactPresageDetail(error.message, process.env.SMARTSPECTRA_API_KEY) });
  // Restart in a fresh child: the SDK has process-global state, and recreating
  // it inside an error callback can lose startup errors or hang on teardown.
  emit({ type: 'error', ...failure });
  void close(1);
}
function setup() {
  if (!process.env.SMARTSPECTRA_API_KEY) throw new Error('Missing key');
  preparePresageRuntime();
  const current = new SmartSpectraSDK({ apiKey: process.env.SMARTSPECTRA_API_KEY, requestedMetrics: [2, 15], enableTelemetry: false, logLevel: SmartSpectraLogLevel.kNone });
  sdk = current;
  const sampleMetrics = createMetricSampler();
  current.on('validationStatus', (code, _at, hint) => {
    if (sdk !== current || closing) return;
    const changed = code !== validation.code || hint !== validation.hint;
    validation = { code, hint }; if (changed) emit({ type: 'validation', ...validation });
  });
  current.on('error', (code, message, retryable) => {
    if (sdk !== current || closing) return;
    fail({ code, message, retryable }, 'sdk');
  });
  current.on('metrics', (buf, timestampUs) => {
    if (sdk !== current || closing) return;
    const data = decodeMetrics(buf); if (Buffer.isBuffer(data)) return;
    const sample = sampleMetrics(data, Number(timestampUs));
    if (sample) emit({ ...sample, validation });
  });
  current.useCustomInput(); current.start(); if (!closing) emit({ type: 'ready' });
}
try { setup(); } catch (error) { fail(error, 'startup'); }
async function pump() {
  if (pumping || closing) return;
  pumping = true;
  try {
    while (queue.length && !closing) {
      const { jpeg, at } = queue.shift(); if (at <= lastTs || Date.now() - at > 1000) { dropped++; continue; }
      const decodeStarted = performance.now();
      let stage = 'decode';
      try {
        const decoder = sharp(jpeg, { limitInputPixels: 1280 * 720, failOn: 'warning' });
        const metadata = await decoder.metadata();
        if (metadata.format !== 'jpeg' || metadata.width > 1280 || metadata.height > 720) throw new Error('frame dimensions');
        const { data, info } = await decoder.toColourspace('srgb').removeAlpha().raw().toBuffer({ resolveWithObject: true });
        if (Date.now() - at > 1000) { dropped++; continue; }
        stage = 'submit';
        if (!closing) {
          const accepted = sdk.sendFrame(data, info.width, info.height, info.width * 3, PixelFormat.kRGB, Math.round(at * 1000));
          if (!accepted) { dropped++; continue; }
          submitted++; intervalFrames++; decodeTotal += performance.now() - decodeStarted; sourceAgeMs = Math.max(0, Date.now() - at);
          if (lastTs === -1) emit({ type: 'reset', at });
          lastTs = at;
        }
      } catch (error) {
        if (stage === 'submit') { fail({ code: error.code ?? 8, message: error.message, retryable: error.retryable }, stage); break; }
        // A single malformed frame must not discard a whole measurement window.
        dropped++;
      }
    }
  } finally { pumping = false; }
}
process.stdin.on('data', chunk => {
  if (closing) return;
  pending = Buffer.concat([pending, chunk]);
  if (pending.length > 2 * 1024 * 1024) return void close(1);
  while (pending.length >= 12) {
    const size = pending.readUInt32LE(0);
    if (size < 4 || size > 250_000) return void close(1);
    if (pending.length < size + 12) break;
    queue.push({ jpeg: Buffer.from(pending.subarray(12, size + 12)), at: pending.readDoubleLE(4) });
    pending = pending.subarray(size + 12);
    if (queue.length > 12) { queue.shift(); dropped++; }
  }
  void pump();
});
process.stdin.on('end', () => void close());
process.on('SIGTERM', () => void close());
process.on('SIGINT', () => void close());
