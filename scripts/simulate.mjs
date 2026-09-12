#!/usr/bin/env node
/**
 * Plays a full match against a running dev server with a scripted hero and fake tells.
 * Use it to populate a rail (/rail/<code>) and a reveal (/reveal/<sessionId>) without a camera or API keys.
 *
 *   npm run dev            # in another terminal
 *   node scripts/simulate.mjs [--slow] [--base http://localhost:3000]
 *
 * --slow waits ~2s between hero actions so you can watch the rail update live.
 */
const args = process.argv.slice(2);
const base = args.includes("--base") ? args[args.indexOf("--base") + 1] : "http://localhost:3000";
const slow = args.includes("--slow");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const post = async (path, body) => {
  const r = await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json();
  if (!r.ok) throw new Error(`${path}: ${JSON.stringify(d)}`);
  return d;
};

/** Fake TellVector: bluffing heroes get "bluff" evidence, value bets get "strength" evidence. */
function fakeTells(isBluff) {
  const bluffEv = [
    { signal: "blink_rate", direction: "bluff", strength: 0.6, text: "blink rate 2.1x baseline" },
    { signal: "freeze", direction: "bluff", strength: 0.7, text: "went unusually still" },
    { signal: "hover_fold", direction: "bluff", strength: 0.5, text: "hovered over Fold before betting" },
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

const { sessionId, railCode } = await post("/api/session", { personaId: "vega" });
console.log(`session ${sessionId}\nrail   ${base}/rail/${railCode}\nreveal ${base}/reveal/${sessionId}\n`);
// Fake baseline so the reveal has one.
await fetch(base + "/api/session", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, baseline: { blinkRate: 14, headMotion: 0.002, tension: 0.12, smile: 0.08, decisionLatencyMs: 3500, calibratedAt: Date.now() } }) });

let r = await post("/api/game/start", { sessionId });
const total = r.state.config.startingStack * 2;
let hands = 0;

const report = (s) => {
  const h = s.hand;
  hands++;
  console.log(`hand ${h.handNumber}: ${h.winner} wins ${h.pot} · board ${h.board.join(" ") || "—"} · stacks ${s.stacks.hero}/${s.stacks.villain}${h.showdown ? ` · ${h.showdown.hero} vs ${h.showdown.villain}` : ""}`);
};

while (!r.state.over) {
  const s = r.state;
  const h = s.hand;
  if (h.over) {
    report(s);
    if (s.stacks.hero + s.stacks.villain !== total) throw new Error("chips not conserved");
    if (slow) await sleep(2000);
    r = await post("/api/game/next", { sessionId });
    continue;
  }
  if (h.toAct !== "hero") throw new Error("stuck: hero not to act");
  const legal = s.legalActions;
  const b = s.bounds;
  const roll = Math.random();
  const aggressive = roll < 0.35;
  let type;
  let amount;
  if (aggressive && legal.includes("raise")) { type = "raise"; amount = Math.min(b.maxTotal, b.minTotal + Math.round(h.pot * 0.5)); }
  else if (aggressive && legal.includes("bet")) { type = "bet"; amount = Math.min(b.maxTotal, b.minTotal + Math.round(h.pot * 0.5)); }
  else if (legal.includes("check")) type = "check";
  else if (legal.includes("call") && roll < 0.85) type = "call";
  else if (legal.includes("allin") && roll < 0.9) type = "allin";
  else type = "fold";
  const isBluff = (type === "bet" || type === "raise" || type === "allin") && Math.random() < 0.5;
  if (slow) await sleep(1500 + Math.random() * 1500);
  r = await post("/api/game/act", { sessionId, type, amount, latencyMs: Math.round(1000 + Math.random() * 5000), tells: fakeTells(isBluff) });
  for (const d of r.villainDecisions) console.log(`   villain ${d.action}${d.amount ? " " + d.amount : ""}${d.llmUsed ? ` — "${d.tableTalk}"` : " (math)"}`);
}
report(r.state);
await fetch(base + "/api/session", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, end: true }) });
console.log(`\nmatch over after ${hands} hands · final ${r.state.stacks.hero}/${r.state.stacks.villain}\nreveal ${base}/reveal/${sessionId}`);
