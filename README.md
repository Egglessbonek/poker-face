# Poker Face

**The only opponents who can see your pulse.**

A No-Limit Hold'em table for friends and AI players. Create a table, share the 4-digit code, and sit down. Every AI at the table also gets your tells: blink rate, gaze, stillness, tension, micro-expressions, decision latency, and cursor hesitation, read from your webcam in the browser. Spectators join the **Rail** with the same code and watch the tells live. After the match, the **Reveal** shows exactly which bluffs your face captioned.

## Stack

| Layer | Tech |
| --- | --- |
| App | Next.js 16 (App Router), React 19, Tailwind v4 |
| Camera tells | MediaPipe Face Landmarker (WASM, in-browser, 478 landmarks + 52 blendshapes) |
| Poker | N-player NLHE engine with side pots, `pokersolver` + Monte Carlo equity |
| AI players | Equity + tells -> LLM (Gemini or Claude, provider-abstracted) -> strict JSON action + table talk |
| Voice | ElevenLabs TTS, one voice per persona, played on every client |
| Realtime | Server-Sent Events, in-memory bus, per-viewer filtering (private cards, tell visibility) |
| Deploy | Railway (single Node process) |

## How a table works

1. **Host** opens `/table/new`: seats (2-9), blinds, stacks, hands, turn timer, AI personas, and **who sees the tells** (AIs and rail by default; humans never see their own during play).
2. **Players** open `/table/<code>`, type a name, and optionally calibrate a 10s face baseline in the lobby.
3. The host deals. AI turns run on the server; humans get a turn timer that auto-checks/folds.
4. **Spectators** open `/rail/<code>`: every card, every human's live tell HUD, the AIs' stated reads and table talk.
5. When the match ends, `/reveal/<code>` grades each human: poker-face score, bluffs caught, biggest leaks, and the moments where a tell changed an AI's action.

## Layout

```
src/app/                landing, /table/new, /table/[code], /rail, /rail/[code], /reveal/[code], /api/table/*
src/lib/poker/          cards, engine (N-player NLHE + side pots), equity
src/lib/game/           table manager (lobby, hand loop, AI turns, timers, log), reveal analysis
src/lib/realtime/bus.ts per-viewer SSE pub/sub
src/lib/tells/          landmarker, features, emotion, baseline, cursor, fuse (client-side)
src/lib/villain/        brain, prompt, personas
src/lib/llm/            provider abstraction (Gemini | Anthropic)
src/lib/store.ts        in-memory table logs
src/components/         table (oval, lobby, config), rail, reveal, tell HUD, action bar
```

## Run

```bash
cp .env.example .env.local   # keys are optional: without them the AIs play math-only and talk is silent
npm install
npm run dev                  # http://localhost:3000
npm test
npm run simulate -- --humans 2 --ais 2 --hands 10   # scripted match against the dev server; prints rail + reveal links
```
