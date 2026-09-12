#!/usr/bin/env node
/**
 * Plays a full table in a real (headless) Chrome with a FAKE WEBCAM, so the camera -> tells -> AI -> reveal
 * loop can be exercised without a human. Chrome loops a video file as the camera.
 *
 *   ffmpeg -i my-face.mov -vf "scale=640:480:force_original_aspect_ratio=increase,crop=640:480" -r 30 -q:v 5 -f mjpeg /tmp/face-cam.mjpeg
 *   BASE=http://localhost:3000 CAM=/tmp/face-cam.mjpeg node scripts/e2e-fake-camera.mjs
 *
 * Needs Google Chrome installed and `playwright` (devDependency). Screenshots land in ./e2e/. Prints the table
 * code so you can read /api/table/<code>/log for the tell vectors the AIs saw.
 * Do not commit face clips.
 */
import { chromium } from "playwright";
const BASE = process.env.BASE ?? "http://localhost:3000";
const CAM = process.env.CAM ?? "/tmp/face-cam.mjpeg";
const shot = async (page, name) => page.screenshot({ path: `e2e/${name}.png`, fullPage: false }).catch(() => {});
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

const browser = await chromium.launch({
  channel: "chrome", headless: true,
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-video-capture=${CAM}`, "--autoplay-policy=no-user-gesture-required"],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ["camera"] });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 200)}`));

try {
  await page.goto(`${BASE}/table/new`, { waitUntil: "networkidle", timeout: 60000 });
  await page.getByPlaceholder("Host").fill("E2E Human");
  await page.getByLabel(/hands/i).fill("3");
  const timer = page.getByLabel(/turn timer/i);
  if ((await timer.evaluate((el) => el.tagName)) === "SELECT") await timer.selectOption("0");
  else await timer.fill("0");
  await shot(page, "01-config");
  await page.locator("form button[type=submit], form button:not([type=button])").last().click();
  await page.waitForURL(/\/table\/[A-Z]{4}$/, { timeout: 30000 });
  const code = page.url().split("/").pop();
  log("table", code);
  await page.getByRole("button", { name: /turn on camera/i }).click({ timeout: 30000 });
  const calib = page.getByRole("button", { name: /relax and start baseline/i });
  await calib.waitFor({ state: "visible", timeout: 60000 });
  const t0 = Date.now();
  while (Date.now() - t0 < 45000 && !(await calib.isEnabled())) await page.waitForTimeout(500);
  log("face locked after", Math.round((Date.now() - t0) / 1000), "s; enabled:", await calib.isEnabled());
  await shot(page, "02-lobby-camera");
  if (await calib.isEnabled()) { await calib.click(); await page.waitForTimeout(11500); log("calibrated"); } else { log("face never locked; skipping baseline"); await page.getByRole("button", { name: /skip/i }).click().catch(() => {}); }
  await shot(page, "03-lobby-calibrated");
  await page.getByRole("button", { name: /deal the first hand/i }).click();
  log("started");

  const rail = await ctx.newPage();
  await rail.goto(`${BASE}/rail/${code}`, { waitUntil: "domcontentloaded", timeout: 60000 });

  let acted = 0, shots = 0; const start = Date.now();
  while (Date.now() - start < 8 * 60_000) {
    if (await page.getByText(/match over|took the table|standings|final chips|play again/i).first().isVisible().catch(() => false)) break;
    const btn = async (a) => page.locator(`[data-action="${a}"]:enabled, button:enabled:has-text("${{ fold: "Fold", call: "Call", check: "Check", bet: "Raise" }[a]}")`).first();
    const call = await btn("call"), check = await btn("check"), bet = await btn("bet"), fold = await btn("fold");
    const canCall = await call.count(), canCheck = await check.count(), canBet = await bet.count();
    if (canCall || canCheck || canBet) {
      await page.waitForTimeout(1200 + Math.random() * 2500); // human-ish latency for the tell window
      const r = Math.random();
      if (canBet && r < 0.3) { await bet.click(); acted++; log("act raise/bet"); }
      else if (canCheck) { await check.click(); acted++; log("act check"); }
      else if (canCall && r < 0.85) { await call.click(); acted++; log("act call"); }
      else if (await fold.count()) { await fold.click(); acted++; log("act fold"); }
      if (shots < 3) { shots++; await shot(page, `04-play-${shots}`); await shot(rail, `05-rail-${shots}`); }
    }
    await page.waitForTimeout(700);
  }
  log("actions taken:", acted);
  await shot(page, "06-finished"); await shot(rail, "07-rail-final");
  await page.goto(`${BASE}/reveal/${code}`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
  await shot(page, "08-reveal");
  const revealText = (await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 700);
  log("reveal:", revealText);
  console.log("CODE", code);
} catch (e) {
  log("FAILED:", String(e).slice(0, 400)); await shot(page, "99-failure");
} finally {
  console.log("--- console errors/warnings (deduped) ---"); for (const e of [...new Set(errors)].slice(0, 15)) console.log(e);
  await browser.close();
}
