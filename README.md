# Poker Face

**The only opponent who can see your pulse.**

Heads-up No-Limit Hold'em against an AI villain that watches you through the webcam. Every decision you make, the villain also gets your tells: blink rate, gaze, stillness, tension, micro-expressions, decision latency, cursor hesitation, and (optionally) your voice. Spectators join the **Rail** with a 4-digit code and watch your tells live. After the match, the **Reveal** shows exactly which hands your face folded before you did.

## Stack

| Layer | Tech |
| --- | --- |
| App | Next.js 16 (App Router), React 19, Tailwind v4 |
| Camera tells | MediaPipe Face Landmarker (WASM, in-browser, 478 landmarks + 52 blendshapes) |
| Poker math | `pokersolver` + Monte Carlo equity |
| Villain brain | Equity + tells -> LLM (Gemini or Claude, provider-abstracted) -> strict JSON action |
| Voice | ElevenLabs Conversational AI (villain persona), TTS fallback |
| Spectators | Server-Sent Events, in-memory bus, 4-digit lobby code |
| Deploy | Railway (single Node process) |

## Layout

```
src/app/            landing, /play, /rail, /rail/[code], /reveal/[id], API routes
src/lib/poker/      cards, engine (HU NLHE state machine), equity
src/lib/tells/      landmarker, features, emotion, baseline, cursor, voice, fuse
src/lib/villain/    brain, prompt, personas
src/lib/llm/        provider abstraction
src/lib/rail/       SSE bus + code generator
src/lib/store.ts    in-memory sessions
src/components/     table, action bar, HUD, rail, reveal
```

## Run

```bash
cp .env.example .env.local   # fill in keys
npm install
npm run dev                  # http://localhost:3000
npm test
```
