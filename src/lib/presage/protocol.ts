// Frames: little-endian u32 JPEG byte length, f64 capture epoch milliseconds, JPEG bytes.
export const MAX_BATCH_BYTES = 2 * 1024 * 1024;
export const MAX_FRAME_BYTES = 250_000;
export const MAX_BATCH_FRAMES = 12;
export function validateFrames(data: Uint8Array, previousAt: number, now = Date.now()): { lastAt: number; count: number } {
  if (!data.byteLength || data.byteLength > MAX_BATCH_BYTES) throw new Error("Frame batch is empty or too large");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0, count = 0, lastAt = previousAt;
  while (offset < data.byteLength) {
    if (offset + 12 > data.byteLength) throw new Error("Truncated frame header");
    const size = view.getUint32(offset, true), at = view.getFloat64(offset + 4, true);
    if (size < 4 || size > MAX_FRAME_BYTES || offset + 12 + size > data.byteLength || ++count > MAX_BATCH_FRAMES) throw new Error("Invalid frame size or count");
    if (!Number.isFinite(at) || at <= lastAt || at > now + 5000 || at < now - 10_000) throw new Error("Frame timestamp is stale or out of order");
    if (data[offset + 12] !== 0xff || data[offset + 13] !== 0xd8) throw new Error("Expected a JPEG frame");
    lastAt = at; offset += 12 + size;
  }
  return { lastAt, count };
}
