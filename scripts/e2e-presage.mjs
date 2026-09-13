// Synthetic-camera transport check. CAM=/path/to/face.mjpeg can test a real consented clip.
// A synthetic feed must never count as physiological validation.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.BASE ?? 'http://localhost:3000';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', ...(process.env.CAM ? [`--use-file-for-fake-video-capture=${process.env.CAM}`] : [])] });
let room;
const call = async (path, body) => { const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); assert.equal(r.status, 200); return r.json(); };
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['camera'] });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  room = await call('/api/table', { name: 'Presage integration check', config: { aiPlayers: [], turnTimerSec: 0 } });
  await call(`/api/table/${room.code}/join`, { name: 'Other seat' });
  await context.addInitScript(({ code, playerId, token }) => localStorage.setItem(`pf:${code}`, JSON.stringify({ playerId, token, name: 'Presage integration check' })), room);
  let uploads = 0; page.on('response', r => { if (r.url().endsWith('/vitals') && r.request().method() === 'PUT' && r.status() === 200) uploads++; });
  await page.goto(`${base}/table/${room.code}`);
  await page.getByRole('button', { name: 'Turn on camera', exact: true }).click();
  await page.waitForTimeout(6000);
  await call(`/api/table/${room.code}/start`, { token: room.token });
  await page.waitForTimeout(process.env.CAM ? 40000 : 17000);
  const url = `${base}/api/table/${room.code}/vitals`, headers = { Authorization: `Bearer ${room.token}` };
  const view = await fetch(`${url}?history=1`, { headers }).then(r => r.json());
  console.log(JSON.stringify({ status: view.status, message: view.message, validation: view.validation, uploads, samples: view.history.length, usablePulse: view.history.filter(s => s.pulse.quality === 'usable').length, usableBreathing: view.history.filter(s => s.breathing.quality === 'usable').length }));
  assert.ok(['measuring', 'starting'].includes(view.status), view.message);
  assert.ok(uploads > 30, 'camera should upload automatically');
  assert.equal((await fetch(url)).status, 401, 'rail cannot read private measurements');
  assert.equal(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight), true, 'game viewport must not scroll');
  await page.screenshot({ path: '/tmp/presage-playing.png' });
  await page.getByRole('button', { name: 'Turn off camera and measurements' }).click();
  await page.waitForTimeout(1000);
  const stopped = await fetch(url, { headers }).then(r => r.json());
  assert.equal(stopped.status, 'stopped'); assert.equal(stopped.latest, null);
  assert.deepEqual(errors, []);
  console.log('Automatic capture, authenticated access, fixed viewport and shutdown passed.');
} finally { if (room) await call(`/api/table/${room.code}/end`, { token: room.token }).catch(() => {}); await browser.close(); }
