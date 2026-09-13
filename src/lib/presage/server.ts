import "server-only";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { qualifyRate, refreshRate, referenceRate, confidencePolicy, type ArtifactTimes, type RawRate } from "./quality";
import { createDiagnostics, recordQuality, type SignalDiagnostics, type PipelineStats } from "./diagnostics";
import { pressureMoments } from "./insights";
import { validateFrames } from "./protocol";
import type { CaptureContext, PressureEvent, VitalsSample, VitalsView } from "./types";

const IDLE_MS = 15_000, RETAIN_MS = 2 * 60 * 60_000, MAX_SAMPLES = 1800;
interface Session {
  id: string; key: string; startedAt: number; lastSeen: number; lastFrameAt: number;
  status: VitalsView["status"]; message: string; worker?: ChildProcessWithoutNullStreams;
  history: VitalsSample[]; validation: { code: number | null; hint: string };
  handNumber: number; events: PressureEvent[];
  retryable?: boolean;
  diagnostics: SignalDiagnostics; artifacts: ArtifactTimes;
}
const globalSessions = globalThis as unknown as { __presageSessions?: Map<string, Session>; __presageCleanup?: ReturnType<typeof setInterval>; __presageWorkers?: Set<ChildProcessWithoutNullStreams> };
const sessions = globalSessions.__presageSessions ??= new Map<string, Session>();
const workers = globalSessions.__presageWorkers ??= new Set([...sessions.values()].flatMap(s => s.worker ? [s.worker] : []));
export class VitalsError extends Error { constructor(message: string, public status = 400, public retryable = false) { super(message); } }
export function presageAvailable() { return !!process.env.SMARTSPECTRA_API_KEY; }
function stop(session: Session, message = "Camera measurement stopped") {
  const worker = session.worker;
  session.worker = undefined;
  if (session.status !== "error") session.status = "stopped";
  if (session.status !== "error" || message !== "Camera measurement stopped") session.message = message;
  if (worker) {
    worker.stdin.end();
    const timer = setTimeout(() => worker.kill("SIGKILL"), 4000); timer.unref();
    worker.once("exit", () => clearTimeout(timer));
  }
}
if (!globalSessions.__presageCleanup) {
  globalSessions.__presageCleanup = setInterval(() => {
    for (const [key, session] of sessions) {
      if (session.worker && Date.now() - session.lastSeen > IDLE_MS) stop(session, "Camera stream ended. Check the connection and try again.");
      if (!session.worker && Date.now() - session.lastSeen > RETAIN_MS) sessions.delete(key);
    }
  }, 5000);
  globalSessions.__presageCleanup.unref();
}
const keyOf = (code: string, playerId: string) => `${code}:${playerId}`;
export function startVitals(code: string, playerId: string): string {
  if (!presageAvailable()) throw new VitalsError("Presage is not configured on this server", 503);
  const key = keyOf(code, playerId), existing = sessions.get(key);
  if (existing?.worker) { existing.lastSeen = Date.now(); return existing.id; }
  const configuredLimit = Number(process.env.PRESAGE_MAX_SESSIONS ?? 2);
  const limit = Number.isFinite(configuredLimit) ? Math.max(1, Math.min(8, configuredLimit)) : 2;
  if (workers.size >= limit) throw new VitalsError("Camera measurements are at capacity. Poker and facial tells are still available.", 503, true);
  const session: Session = { id: randomUUID(), key, startedAt: Date.now(), lastSeen: Date.now(), lastFrameAt: 0, status: "starting", message: "Starting pulse and breathing measurement", history: [], events: [], handNumber: 0, diagnostics: createDiagnostics(confidencePolicy(process.env.PRESAGE_PULSE_CONFIDENCE, process.env.PRESAGE_BREATHING_CONFIDENCE)), artifacts: {}, validation: { code: null, hint: "Waiting for a clear view of your face and chest" } };
  sessions.set(key, session);
  // A separate process is required: native SDK state is process-global. No LLM/voice keys passed through.
  const worker = spawn(process.execPath, [path.join(process.cwd(), "scripts/presage-worker.mjs")], {
    env: { NODE_ENV: process.env.NODE_ENV, PATH: process.env.PATH, SMARTSPECTRA_API_KEY: process.env.SMARTSPECTRA_API_KEY }, stdio: ["pipe", "pipe", "pipe"],
  });
  session.worker = worker; workers.add(worker);
  let output = "";
  worker.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
    if (output.length > 64_000) { output = ""; return; }
    let end: number;
    while ((end = output.indexOf("\n")) >= 0) {
      const line = output.slice(0, end); output = output.slice(end + 1);
      if (!line.startsWith("{")) continue;
      try {
        const data = JSON.parse(line) as { type: string; at: number; pulse?: RawRate; breathing?: RawRate; validation: Session["validation"]; code: number; hint: string; message: string; retryable?: boolean; stats?: PipelineStats };
        if (!session.worker) continue;
        if (data.type === "ready") { session.status = "measuring"; session.message = "Gathering measurements"; }
        if (data.type === "validation") {
          session.validation = { code: data.code, hint: data.hint };
          if (data.code === 12) session.artifacts.motionAt = Date.now();
        }
        if (data.type === "pipeline" && data.stats) session.diagnostics.pipeline = data.stats;
        if (data.type === "recovering") { session.status = "starting"; session.message = data.message; session.validation = { code: null, hint: data.message }; }
        if (data.type === "reset") { session.startedAt = data.at; session.status = "measuring"; }
        if (data.type === "error") { session.status = "error"; session.retryable = data.retryable ?? true; stop(session, data.message); }
        if (data.type === "sample") {
          const now = Date.now();
          if (data.validation.code === 12) session.artifacts.motionAt = now;
          // Use receipt time to detect stale SDK samples; measurement windows retain their source timestamps.
          const sample: VitalsSample = {
            at: now, handNumber: session.handNumber,
            pulse: qualifyRate(data.pulse, "pulse", session.startedAt, now, data.validation.code, { ...session.artifacts, threshold: session.diagnostics.policy.pulse }),
            breathing: qualifyRate(data.breathing, "breathing", session.startedAt, now, data.validation.code, { ...session.artifacts, threshold: session.diagnostics.policy.breathing }),
            validation: data.validation,
          };
          for (const kind of ["pulse", "breathing"] as const) recordQuality(session.diagnostics, kind, data[kind], sample[kind], session.startedAt, now, data.validation.code, session.artifacts);
          session.history.push(sample);
          if (session.history.length > MAX_SAMPLES) session.history.shift();
        }
      } catch { /* Ignore native log lines, never forward them or frame contents. */ }
    }
  });
  worker.stderr.on("data", () => {});
  worker.stdin.on("error", () => { session.status = "error"; stop(session, "Camera processing disconnected. Check the connection and try again."); });
  worker.on("error", () => { workers.delete(worker); session.status = "error"; session.retryable = false; stop(session, "Presage runtime could not launch on this server."); });
  worker.on("exit", () => {
    workers.delete(worker);
    if (session.worker === worker) { session.worker = undefined; session.status = "error"; session.message = "Presage stopped. Check the server key, entitlement and runtime."; }
  });
  return session.id;
}
export function pushVitals(code: string, playerId: string, id: string, bytes: Uint8Array, handNumber: number, events: PressureEvent[], context?: CaptureContext) {
  const session = sessions.get(keyOf(code, playerId));
  if (!session || session.id !== id) throw new VitalsError("Camera session expired", 409, true);
  if (!session.worker || session.status === "error") throw new VitalsError(session.message, 409, session.retryable ?? true);
  const { lastAt, count } = validateFrames(bytes, session.lastFrameAt);
  session.diagnostics ??= createDiagnostics(); session.artifacts ??= {};
  session.diagnostics.receivedFrames += count;
  if (context?.mouthMoving && Number.isFinite(context.at) && Math.abs(Date.now() - context.at) < 2000) session.artifacts.mouthMovementAt = context.at;
  session.lastFrameAt = lastAt; session.lastSeen = Date.now(); session.handNumber = handNumber; session.events = events.slice(-200);
  if (session.status === "starting") { session.diagnostics.skippedFrames += count; return; }
  // A slow/startup pipeline must not accumulate seconds of stale video or end capture.
  // Drop this batch under backpressure; the next request carries fresh frames.
  if (session.worker.stdin.writableNeedDrain) {
    session.diagnostics.skippedFrames += count;
    session.message = "Camera processing is catching up. Delayed frames are being skipped.";
    return;
  }
  if (session.status === "measuring") session.message = "Gathering measurements";
  session.worker.stdin.write(bytes);
}
export function stopVitals(code: string, playerId: string, id?: string, erase = false) {
  const key = keyOf(code, playerId), session = sessions.get(key);
  if (!session || (id && session.id !== id)) return;
  stop(session);
  if (erase) sessions.delete(key);
}
export function updateVitalsContext(code: string, playerId: string, events: PressureEvent[]) {
  const session = sessions.get(keyOf(code, playerId));
  if (session) session.events = events.slice(-200);
}
export function stopTableVitals(code: string) {
  for (const session of sessions.values()) if (session.key.startsWith(`${code}:`)) stop(session, "Match ended. Your private measurement session has stopped.");
}
export function readVitals(code: string, playerId: string, includeHistory = false): VitalsView {
  const session = sessions.get(keyOf(code, playerId));
  const history = session?.history ?? [];
  const latest = history.at(-1) ?? null;
  // Never leave a stale "good" value on screen after transport/validation degrades.
  const visible = latest && session?.worker ? { ...latest,
    validation: session.validation,
    pulse: refreshRate(latest.pulse, session.startedAt, Date.now(), session.validation.code, "pulse", session.artifacts),
    breathing: refreshRate(latest.breathing, session.startedAt, Date.now(), session.validation.code, "breathing", session.artifacts),
  } : null;
  return {
    serverNow: Date.now(), validation: session?.validation ?? { code: null, hint: "" }, available: presageAvailable(), sessionId: session?.id ?? null, status: session?.status ?? "off",
    message: session?.message ?? (presageAvailable() ? "Starts with your camera" : "Presage is not configured on this server"),
    retryable: session?.retryable,
    diagnostics: session?.diagnostics ?? createDiagnostics(),
    lastGood: { pulse: history.findLast(s => s.pulse.quality === "usable")?.pulse ?? null, breathing: history.findLast(s => s.breathing.quality === "usable")?.breathing ?? null },
    moments: pressureMoments(history, session?.events ?? [], playerId),
    startedAt: session?.startedAt ?? null, latest: visible,
    baseline: { pulse: referenceRate(history.map(s => s.pulse)), breathing: referenceRate(history.map(s => s.breathing)) },
    history: includeHistory ? history : [], events: includeHistory ? session?.events ?? [] : [],
  };
}
