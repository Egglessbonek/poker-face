import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, linkSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

/** A container-local identity, shared by workers and retained across their restarts.
 * Publish it atomically so simultaneous players never read a partly written ID. */
export function runtimeIdentity(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, 'device-id');
  try { return readIdentity(file); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = path.join(directory, `.device-id-${randomBytes(8).toString('hex')}`);
  writeFileSync(temporary, randomBytes(16).toString('hex') + '\n', { flag: 'wx', mode: 0o600 });
  try { linkSync(temporary, file); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  finally { unlinkSync(temporary); }
  return readIdentity(file);
}

function readIdentity(file) {
  const id = readFileSync(file, 'utf8').trim();
  if (!/^[a-f0-9]{32}$/.test(id)) throw new Error('Presage runtime identity is invalid');
  return id;
}

export function preparePresageRuntime() {
  if (process.platform !== 'linux') return;
  const directory = path.join(process.env.XDG_CACHE_HOME || path.join(homedir(), '.cache'), 'PokerFacePresage');
  const deviceId = runtimeIdentity(directory);
  // SDK 3.3.0's automatic Linux identity detection returns an empty device ID
  // in Railway containers. Its native preconfigure API accepts an explicit ID.
  // The JS bridge is internal, so pin the SDK version and fail clearly on drift.
  const require = createRequire(import.meta.url);
  const bridge = require(path.join(path.dirname(require.resolve('@smartspectra/node-sdk')), 'ffi.js'));
  if (typeof bridge.preconfigure !== 'function') throw new Error('Presage runtime initialization is unavailable in this SDK version');
  bridge.preconfigure(directory, deviceId);
}
