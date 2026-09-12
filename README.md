# Poker Face

**The only opponents who can read your face.**

A No-Limit Hold'em table for friends and AI players. Create a table, share the 4-letter code, and sit down. Every AI at the table also gets your tells: blink rate, gaze, stillness, tension, micro-expressions, and decision timing, read from your webcam in the browser. No microphone, no cursor tracking. Spectators join the **Rail** with the same code and watch the tells live. After the match, the **Reveal** shows exactly which bluffs your face captioned.

## Stack

| Layer | Tech |
| --- | --- |
| App | Next.js 16 (App Router), React 19, Tailwind v4 |
| Camera tells | MediaPipe Face Landmarker (WASM, in-browser, 478 landmarks + 52 blendshapes) |
| Poker | N-player NLHE engine with side pots, `pokersolver` + Monte Carlo equity |
| AI players | Real models via OpenRouter, each playing as itself (no scripted personas): six regulars (Claude, ChatGPT, Grok, Llama, Gemini, DeepSeek) are pinned, the whole catalog is in a dropdown. Equity + tells -> that model -> strict JSON action + table talk in its own voice |
| Voice | ElevenLabs TTS: every AI line is spoken aloud on every client, one signature voice per model vendor (Claude, GPT, Gemini, Grok, Llama, DeepSeek), no two seats at a table share a voice |
| Realtime | Server-Sent Events, in-memory bus, per-viewer filtering (private cards, tell visibility) |
| Deploy | Railway (single Node process) |

## How a table works

1. **Host** opens `/table/new`: chairs (2-9), blinds, stacks, hands, turn timer, **the guest list** (any OpenRouter models, duplicates allowed), and **who sees the tells** (AIs and rail by default; humans never see their own during play).
2. **Players** open `/table/<code>`, type a name, and optionally calibrate a 10s face baseline in the lobby.
3. The host deals. AI turns run on the server; humans get a turn timer that auto-checks/folds.
4. **Spectators** open `/rail/<code>`: every card, every human's live tell HUD, the AIs' stated reads and table talk.
5. When the match ends, `/reveal/<code>` grades each human: poker-face score, bluffs caught, biggest leaks, and the moments where a tell changed an AI's action.

## What the AIs actually see

Nothing is invented. Each human decision ships with a tell vector built in the browser from the webcam, and the AI seats can only cite what is in it (the prompt forbids readings the camera did not report: no pulse, no sweat).

Each human decision produces two evidence lines, and the AIs cite from both.

**On the decision** (the window between being prompted and clicking):

| Signal | Reads as | Why it is in (poker-tells literature) |
| --- | --- | --- |
| Decision timing (fast / slow vs your own norm) | fast bet -> bluff | Timing tells are the strongest class (Elwood, *Reading Poker Tells*) |
| Freeze: head motion far below how still you usually sit while deciding | bluff | Caro; Slepian et al. 2013 on movement smoothness under deception |
| Eyes drop to the bet controls right after a card | strength | Caro's chip glance, the most reliable strength tell, translated to a screen |
| Stared at the flop / turn / river for seconds | weak (bluff if they bet) | Caro: players who miss the flop stare at it; players who hit it look away |
| Looked back at their own cards after a community card | draw (semi-bluff) | Elwood: re-checking hole cards on a draw-heavy board is checking suits |
| Leaned in when a card came | strength | Caro: sudden interest |
| Smile leak (Duchenne) after a card | strength | Ekman; genuine vs social smiles |
| Blink rate vs your baseline, jaw/brow tension | arousal, weak bluff cue | DePaulo et al. 2003 meta-analysis: facial cues are weak alone, so they are capped |

**After a bet** (the five seconds after your own bet or raise), a separate read the AIs see as "after their last bet: …":

| Signal | Reads as | Why it is in |
| --- | --- | --- |
| Froze after betting | bluff | Elwood: bluffers go still after a big bet |
| Looked away and never up at the camera | bluff | Elwood: post-bet gaze avoidance (eye contact, on a screen, is looking up at the camera) |
| Sat back | strength | Elwood: post-bet relaxation |
| Leaned in and held still | bluff | Caro: the frozen lean is the bluffer's posture |
| Blink rate jumped | bluff | Leal & Vrij 2008: liars blink less during the lie and more right after |
| Tension dropped, a genuine smile | strength | Ekman; DePaulo et al. 2003 |

Gaze is coarse on a webcam, so it is used as screen zones relative to your own calibration (board, your cards and the bet controls, up at the camera, away) and as dwell times, never as a point. Posture is the face transform's distance and rotation, so leaning in and sitting back are relative to how you sat during calibration.

Everything is a deviation from **your** baseline: a 10-second calibration in the lobby, then timing adapts to how fast you actually play, and stillness is judged against the median of your own recent decisions (never the calibration), so a naturally still player is not "frozen" on every hand and a freeze cannot fire on your first decision. The AI's math is computed twice, with and without your tells, and the Reveal shows every decision the tells changed.

## Layout

```
src/app/                landing, /table/new, /table/[code], /rail, /rail/[code], /reveal/[code], /api/table/*
src/lib/poker/          cards, engine (N-player NLHE + side pots), equity
src/lib/game/           table manager (lobby, hand loop, AI turns, timers, log), reveal analysis
src/lib/realtime/bus.ts per-viewer SSE pub/sub
src/lib/tells/          landmarker, features, emotion, baseline, fuse (client-side)
src/lib/llm/            models.ts (id helpers + pinned regulars), catalog.ts (cached OpenRouter list), provider
src/lib/villain/        profile (who a seat is), prompt, brain (math -> tells -> the model decides), voices
src/lib/store.ts        in-memory table logs
src/components/         table (oval, lobby, config), rail, reveal, tell HUD, action bar
```

## Run

```bash
cp .env.example .env.local   # set OPENROUTER_API_KEY; without it the AIs play math-only and stay silent
npm install
npm run dev                  # http://localhost:3000
npm test
npm run simulate -- --humans 2 --ais 2 --hands 10   # scripted match against the dev server; prints rail + reveal links
npm run e2e                                          # real Chrome with a fake webcam (see scripts/e2e-fake-camera.mjs): camera -> tells -> AI -> reveal
```

## Deploy (Railway)

Tables, streams, and turn timers live in one Node process, so the app needs a host that runs a single long-lived server. Serverless platforms (Vercel, Netlify functions) will not work: memory is not shared between invocations and streams are cut off.

1. Railway → New Project → Deploy from GitHub → pick this repo. `railway.json` sets the build, start command, health check (`/api/health`), and a single replica.
2. Variables: `OPENROUTER_API_KEY`, `ELEVENLABS_API_KEY`, the `ELEVENLABS_VOICE_*` ids, and `APP_URL` set to the public URL Railway gives you.
3. Generate a domain under Settings → Networking. Share `https://<domain>/table/<code>` with players and `/rail/<code>` with spectators.

Keep it at one replica. Scaling out would split tables across processes. A redeploy restarts the process and ends every table in progress, so deploy between demos, not during one.

