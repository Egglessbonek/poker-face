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
  room = await call('/api/table', { name: 'Presage integration check', isPublic: false, config: { aiPlayers: [], turnTimerSec: 0 } });
  await context.addInitScript(({ code, playerId, token }) => localStorage.setItem(`pf:${code}`, JSON.stringify({ playerId, token, name: 'Presage integration check' })), room);
  let uploads = 0; page.on('response', r => { if (r.url().endsWith('/vitals') && r.request().method() === 'PUT' && r.status() === 200) uploads++; });
  await page.goto(`${base}/table/${room.code}`);
  await page.getByRole('button', { name: 'Turn on camera', exact: true }).click();
  if (process.env.CAM) {
    const calibrate = page.getByRole('button', { name: 'Relax and start baseline', exact: true });
    await calibrate.waitFor({ state: 'visible', timeout: 30000 });
    await calibrate.click({ timeout: 30000 });
    await page.getByRole('heading', { name: 'Camera setup', exact: true }).waitFor({ state: 'hidden', timeout: 30000 });
  } else await page.waitForTimeout(6000);
  await page.waitForTimeout(process.env.CAM ? 40000 : 17000);
  const url = `${base}/api/table/${room.code}/vitals`, headers = { Authorization: `Bearer ${room.token}` };
  const view = await fetch(`${url}?history=1`, { headers }).then(r => r.json());
  console.log(JSON.stringify({ status: view.status, message: view.message, validation: view.validation, uploads, samples: view.history.length, usablePulse: view.history.filter(s => s.pulse.quality === 'usable').length, usableBreathing: view.history.filter(s => s.breathing.quality === 'usable').length }));
  assert.ok(['measuring', 'starting'].includes(view.status), view.message);
  assert.ok(uploads > 30, 'camera should upload automatically');
  if (process.env.PRESAGE_REQUIRE_READINGS === '1') {
    assert.ok(view.history.some(s => s.pulse.quality === 'usable'), 'No usable pulse estimates; transport alone is not measurement validation');
    assert.ok(view.history.some(s => s.breathing.quality === 'usable'), 'No usable breathing estimates; transport alone is not measurement validation');
  }
  assert.equal((await fetch(url)).status, 401, 'rail cannot read private measurements');
  // Exercise the real hook's bounded recovery without crashing anyone else's worker.
  let interrupted = false;
  await page.route('**/vitals', async route => {
    if (!interrupted && route.request().method() === 'PUT') {
      interrupted = true;
      await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Presage camera processing was interrupted.', retryable: true }) });
    } else await route.continue();
  });
  let recovered;
  const recoveryDeadline = Date.now() + 20000;
  do {
    await new Promise(resolve => setTimeout(resolve, 500));
    recovered = await fetch(`${url}?history=1`, { headers }).then(r => r.json());
  } while (Date.now() < recoveryDeadline && (recovered.sessionId === view.sessionId || recovered.status !== 'measuring' || !recovered.diagnostics.pipeline?.submitted));
  assert.ok(interrupted, 'test interruption should reach the capture hook');
  assert.notEqual(recovered.sessionId, view.sessionId, 'capture should automatically start a fresh worker');
  assert.equal(recovered.status, 'measuring', recovered.message);
  assert.ok(recovered.diagnostics.pipeline?.submitted > 0, 'new worker must receive real frames');
  assert.ok(recovered.history.length >= view.history.length, 'recovery must retain completed measurements');
  console.log(JSON.stringify({ recovery: 'passed', retainedSamples: recovered.history.length, restarts: recovered.diagnostics.restarts }));
  await page.screenshot({ path: '/tmp/presage-camera-setup.png' });
  // Abrupt browser closure relies on the idle timeout when unload cleanup cannot run.
  await page.close();
  let stopped;
  const stopDeadline = Date.now() + 25000;
  do { await new Promise(resolve => setTimeout(resolve, 250)); stopped = await fetch(url, { headers }).then(r => r.json()); } while (Date.now() < stopDeadline && stopped.status !== 'stopped');
  assert.equal(stopped.status, 'stopped'); assert.equal(stopped.latest, null);
  assert.deepEqual(errors, []);
  console.log('Automatic capture, authenticated access and shutdown passed.');
} finally {
  if (room) {
    await fetch(`${base}/api/table/${room.code}/vitals?erase=1`, { method: 'DELETE', headers: { Authorization: `Bearer ${room.token}` } }).catch(() => {});
    await call(`/api/table/${room.code}/leave`, { token: room.token }).catch(() => {});
  }
  await browser.close();
}
