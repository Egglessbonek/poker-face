#!/usr/bin/env node
/**
 * Plays a full table match against a running dev server with scripted humans and fake tells.
 * Populates a rail (/rail/<code>) and a reveal (/reveal/<code>) without cameras or API keys.
 *
 *   npm run dev                                   # in another terminal
 *   node scripts/simulate.mjs [--humans 2] [--ais 2] [--hands 12] [--slow] [--base http://localhost:3000]
 *
 * Asserts chip conservation after every hand and fails if no event arrives for 60s (a stalled turn).
 */
const args = process.argv.slice(2);
const flag = (name, def) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : def);
const base = flag("base", "http://localhost:3000");
const humans = Number(flag("humans", 2));
const ais = Number(flag("ais", 2));
const hands = Number(flag("hands", 12));
const slow = args.includes("--slow");
const guests = ["anthropic/claude-sonnet-5", "openai/gpt-5.6-terra", "x-ai/grok-4.6", "meta-llama/llama-4-maverick", "google/gemini-3.8-flash", "deepseek/deepseek-v3.2"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const call = async (path, method, body) => {
  const r = await fetch(base + path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path}: ${JSON.stringify(d)}`);
  return d;
};

/** Fake TellVector: bluffing players get "bluff" evidence, value bets get "strength" evidence. */
function fakeTells(isBluff) {
  const bluffEv = [
    { signal: "blink_rate", direction: "bluff", strength: 0.6, text: "blink rate 2.1x baseline" },
    { signal: "freeze", direction: "bluff", strength: 0.7, text: "went unusually still" },
  ];
  const strongEv = [
    { signal: "smile_leak", direction: "strength", strength: 0.7, text: "smile leak after the flop" },
    { signal: "chip_glance", direction: "strength", strength: 0.5, text: "glanced at chips after the turn" },
  ];
  const evidence = (isBluff ? bluffEv : strongEv).filter(() => Math.random() < 0.8);
  return {
    arousal: Math.round(isBluff ? 60 + Math.random() * 30 : 35 + Math.random() * 25),
    bluffLikelihood: isBluff ? 0.6 + Math.random() * 0.3 : 0.15 + Math.random() * 0.3,
    confidence: 0.8,
    trend: Math.random() < 0.5 ? "rising" : "stable",
    evidence,
  };
}

function fakeFrame() {
  return { t: Date.now(), facePresent: true, confidence: 0.9, blinkRate: 12 + Math.random() * 12, gaze: "cards", headMotion: 0.002, tension: 0.1 + Math.random() * 0.3, smile: Math.random() * 0.3, duchenne: false, emotion: { neutral: 0.6, happy: 0.1, surprise: 0.05, fear: 0.1, anger: 0.05, disgust: 0.05, sad: 0.05 }, fakeSmile: false };
}

/** Minimal SSE client (Node has no EventSource). Calls onEvent for each JSON data line. */
async function stream(url, onEvent, signal) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`stream ${url}: ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of chunk.split("\n")) if (line.startsWith("data: ")) onEvent(JSON.parse(line.slice(6)));
    }
  }
}

// ---------- set up the table ----------
const config = { maxSeats: Math.max(2, humans + ais), aiPlayers: Array.from({ length: ais }, (_, i) => guests[i % guests.length]), handsPerMatch: hands, turnTimerSec: 0, tellVisibility: "ai_and_rail", voice: false };
const host = await call("/api/table", "POST", { config, name: "Sim Host" });
const players = [{ ...host, name: "Sim Host" }];
for (let i = 1; i < humans; i++) players.push({ ...(await call(`/api/table/${host.code}/join`, "POST", { name: `Sim ${i + 1}` })), name: `Sim ${i + 1}` });
const code = host.code;
console.log(`table  ${code}\nrail   ${base}/rail/${code}\nreveal ${base}/reveal/${code}\n`);

for (const p of players) {
  await call(`/api/table/${code}/tells`, "POST", { token: p.token, baseline: { blinkRate: 14, headMotion: 0.002, tension: 0.12, smile: 0.08, decisionLatencyMs: 3500, calibratedAt: Date.now() } });
}

// ---------- scripted players ----------
const ac = new AbortController();
let lastEvent = Date.now();
let finished = false;
let handsSeen = 0;
let totalChips = null;
const acting = new Set();

function policy(state, me) {
  const hand = state.hand;
  const seat = hand.seats[me.seat];
  const cfg = state.config;
  const toCall = Math.max(0, hand.currentBet - seat.committed);
  const maxTotal = seat.stack + seat.committed;
  const minTotal = hand.currentBet === 0 ? Math.min(cfg.bigBlind, maxTotal) : Math.min(hand.currentBet + hand.minRaise, maxTotal);
  const roll = Math.random();
  const aggressive = roll < 0.3;
  if (toCall === 0) {
    if (aggressive && seat.stack > 0) return { type: hand.currentBet > 0 ? "raise" : "bet", amount: Math.min(maxTotal, minTotal + Math.round(hand.pot * 0.5)) };
    return { type: "check" };
  }
  if (aggressive && maxTotal > hand.currentBet) return { type: "raise", amount: Math.min(maxTotal, minTotal + Math.round(hand.pot * 0.5)) };
  if (roll < 0.8) return { type: "call" };
  if (roll < 0.85 && seat.stack > 0) return { type: "allin" };
  return { type: "fold" };
}

async function runPlayer(p) {
  await stream(`${base}/api/table/${code}/stream?token=${p.token}`, async (ev) => {
    lastEvent = Date.now();
    if (ev.type !== "state") return;
    const state = ev.state;
    if (state.phase === "finished") {
      if (!finished) {
        finished = true;
        console.log(`\nmatch over after ${handsSeen} hands`);
        for (const s of state.standings) console.log(`  ${s.name.padEnd(12)} ${String(s.stack).padStart(6)} (${s.net >= 0 ? "+" : ""}${s.net})`);
        console.log(`reveal ${base}/reveal/${code}`);
        ac.abort();
      }
      return;
    }
    const me = state.players.find((x) => x.id === p.playerId);
    const hand = state.hand;
    if (!hand || !me) return;
    if (p.id === players[0].playerId && hand.over && p.lastReported !== hand.handNumber) {
      p.lastReported = hand.handNumber;
      handsSeen++;
      const sum = state.players.reduce((a, x) => a + x.stack, 0);
      if (totalChips === null) totalChips = sum;
      if (sum !== totalChips) {
        console.error(`chips not conserved: ${sum} vs ${totalChips}`);
        process.exit(1);
      }
      const name = (seat) => state.players.find((x) => x.seat === seat)?.name;
      const win = (hand.results ?? []).filter((r) => r.won > 0).map((r) => `${name(r.seat)} +${r.won}${r.descr ? ` (${r.descr})` : ""}`).join(", ");
      console.log(`hand ${hand.handNumber}: ${win} · board ${hand.board.join(" ") || "—"}${hand.pots && hand.pots.length > 1 ? ` · ${hand.pots.length} pots` : ""}`);
    }
    if (hand.over || hand.toAct !== me.seat) return;
    const key = `${hand.handNumber}:${hand.street}:${hand.actions.length}`;
    if (acting.has(p.playerId + key)) return;
    acting.add(p.playerId + key);
    const a = policy(state, me);
    const isBluff = (a.type === "bet" || a.type === "raise" || a.type === "allin") && Math.random() < 0.5;
    if (slow) await sleep(1200 + Math.random() * 1500);
    await call(`/api/table/${code}/tells`, "POST", { token: p.token, frame: fakeFrame() }).catch(() => {});
    await call(`/api/table/${code}/act`, "POST", { token: p.token, ...a, latencyMs: Math.round(800 + Math.random() * 4000), tells: fakeTells(isBluff) }).catch((e) => console.warn(`  ${p.name}: ${e.message}`));
  }, ac.signal).catch((e) => {
    if (!ac.signal.aborted) throw e;
  });
}

players.forEach((p) => { p.id = p.playerId; });
const runs = players.map(runPlayer);
await sleep(300);
await call(`/api/table/${code}/start`, "POST", { token: host.token });

const watchdog = setInterval(() => {
  if (finished) return clearInterval(watchdog);
  if (Date.now() - lastEvent > 60_000) {
    console.error("stalled: no events for 60s");
    process.exit(1);
  }
}, 5000);

await Promise.all(runs);
clearInterval(watchdog);
process.exit(0);
