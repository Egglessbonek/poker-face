// API/native transport smoke test only. Synthetic frames cannot validate vital accuracy.
import assert from 'node:assert/strict';
import sharp from 'sharp';
const base = process.env.BASE ?? 'http://localhost:3000';
let room, sessionId;
async function post(path, body) {
  const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(response.status, 200, await response.clone().text()); return response.json();
}
try {
  room = await post('/api/table', { name: 'Capture check', isPublic: false, config: { aiPlayers: [], turnTimerSec: 0 } });
  const url = `${base}/api/table/${room.code}/vitals`, auth = { Authorization: `Bearer ${room.token}` };
  assert.equal((await fetch(url)).status, 401);
  const started = await fetch(url, { method: 'POST', headers: auth });
  assert.equal(started.status, 200, await started.clone().text());
  sessionId = (await started.json()).sessionId; assert.ok(sessionId);
  const jpeg = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#999999' } }).jpeg({ quality: 95 }).toBuffer();
  let view;
  for (let i = 0; i < 25; i++) {
    await new Promise(resolve => setTimeout(resolve, 200));
    const at = Date.now() - 190;
    const frames = Array.from({ length: 6 }, (_, f) => {
      const frame = Buffer.alloc(jpeg.length + 12);
      frame.writeUInt32LE(jpeg.length); frame.writeDoubleLE(at + f * 33, 4); jpeg.copy(frame, 12); return frame;
    });
    const response = await fetch(url, { method: 'PUT', headers: { ...auth, 'Content-Type': 'application/octet-stream', 'X-Vitals-Session': sessionId }, body: Buffer.concat(frames) });
    assert.equal(response.status, 200, await response.clone().text()); view = await response.json();
  }
  assert.ok(view.diagnostics.receivedFrames >= 150);
  assert.ok(view.diagnostics.pipeline?.submitted > 0, 'Native worker did not submit frames');
  console.log(JSON.stringify({ check: 'Synthetic transport only; no accuracy claim', status: view.status, received: view.diagnostics.receivedFrames, pipeline: view.diagnostics.pipeline }));
  const erased = await fetch(`${url}?erase=1`, { method: 'DELETE', headers: { ...auth, 'X-Vitals-Session': sessionId } }).then(r => r.json());
  assert.equal(erased.latest, null); assert.deepEqual(erased.history, []); assert.equal(erased.diagnostics.receivedFrames, 0);
  sessionId = null;
  console.log('Authentication, native frame submission, diagnostics and erasure passed.');
} finally {
  if (room) {
    if (sessionId) await fetch(`${base}/api/table/${room.code}/vitals?erase=1`, { method: 'DELETE', headers: { Authorization: `Bearer ${room.token}`, 'X-Vitals-Session': sessionId } }).catch(() => {});
    await post(`/api/table/${room.code}/leave`, { token: room.token }).catch(() => {});
  }
}
