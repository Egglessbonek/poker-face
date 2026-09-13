// One native SDK pipeline per child. Frames are transient; stdout contains measurements/status only.
import { SmartSpectraSDK, SmartSpectraLogLevel, PixelFormat, decodeMetrics } from '@smartspectra/node-sdk';
import sharp from 'sharp';
import { createMetricSampler } from './presage-metrics.mjs';
const emit = value => process.stdout.write(JSON.stringify(value) + '\n');
let sdk, closing = false, recovering = false, pending = Buffer.alloc(0), pumping = false, lastTs = -1;
let validation = { code: null, hint: 'Waiting for camera measurements' };
const queue = [], failures = [];
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
  try { await sdk?.destroy(); } finally { clearTimeout(deadline); process.exit(code); }
}
async function recover() {
  if (recovering || closing) return;
  const now = Date.now(); failures.push(now);
  while (failures[0] < now - 60_000) failures.shift();
  if (failures.length > 3) { emit({ type: 'error', retryable: false, message: 'Camera processing could not recover. Check the connection and try again.' }); return void close(1); }
  recovering = true; queue.length = 0;
  emit({ type: 'recovering', message: 'Camera tracking interrupted. Reacquiring your face and chest.' });
  let timer;
  try {
    await Promise.race([sdk.destroy(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('cleanup timeout')), 4000); })]);
    if (closing) return;
    lastTs = -1; validation = { code: null, hint: 'Reacquiring your face and chest' };
    // A fresh source and full warm-up are mandatory after any pipeline reset.
    setup(); emit({ type: 'reset', at: Date.now() });
  } catch { emit({ type: 'error', retryable: true, message: 'Camera tracking could not restart.' }); void close(1); }
  finally { clearTimeout(timer); recovering = false; if (!closing) void pump(); }
}
function setup() {
  if (!process.env.SMARTSPECTRA_API_KEY) throw new Error('Missing key');
  const current = new SmartSpectraSDK({ apiKey: process.env.SMARTSPECTRA_API_KEY, requestedMetrics: [2, 15], enableTelemetry: false, logLevel: SmartSpectraLogLevel.kNone });
  sdk = current;
  const sampleMetrics = createMetricSampler();
  current.on('validationStatus', (code, _at, hint) => {
    if (sdk !== current || recovering || closing) return;
    const changed = code !== validation.code || hint !== validation.hint;
    validation = { code, hint }; if (changed) emit({ type: 'validation', ...validation });
  });
  current.on('error', (code, _message, retryable) => {
    if (sdk !== current || recovering || closing) return;
    if (retryable || code === 10 || code === 11) { void recover(); return; }
    emit({ type: 'error', retryable: false, message: code === 2 ? 'Presage authentication failed. Check the server key.' : 'Presage measurement stopped.' }); void close(1);
  });
  current.on('metrics', (buf, timestampUs) => {
    if (sdk !== current || recovering || closing) return;
    const data = decodeMetrics(buf); if (Buffer.isBuffer(data)) return;
    const sample = sampleMetrics(data, Number(timestampUs));
    if (sample) emit({ ...sample, validation });
  });
  current.useCustomInput(); current.start(); emit({ type: 'ready' });
}
try { setup(); } catch { emit({ type: 'error', retryable: false, message: 'Presage could not start. Check the server key and runtime.' }); void close(1); }
async function pump() {
  if (pumping || recovering || closing) return;
  pumping = true;
  try {
    while (queue.length && !recovering && !closing) {
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
        if (!closing && !recovering) {
          sdk.sendFrame(data, info.width, info.height, info.width * 3, PixelFormat.kRGB, Math.round(at * 1000));
          submitted++; intervalFrames++; decodeTotal += performance.now() - decodeStarted; sourceAgeMs = Math.max(0, Date.now() - at);
          if (lastTs === -1) emit({ type: 'reset', at });
          lastTs = at;
        }
      } catch {
        if (stage === 'submit') { void recover(); break; }
        emit({ type: 'error', retryable: true, message: 'Camera frame could not be decoded.' }); void close(1);
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
