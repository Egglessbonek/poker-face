@AGENTS.md

# Poker Face

Hackathon project: a Hold'em table lobby (humans + AI players, 4-digit code) where the AIs read webcam tells. Plan lives in the repo README and the module-level TODO(phase N) comments.

- `npm run dev` / `npm test` (vitest) / `npm run typecheck` / `npm run lint` / `npm run build`
- Shared types are in `src/lib/types.ts`. Add fields there first; every module imports from it.
- Server-only modules (`src/lib/llm`, `src/lib/villain/brain.ts`, `src/lib/store.ts`, `src/lib/realtime/bus.ts`, `src/lib/game/*`) must never be imported from client components. `src/lib/poker/engine.ts` is pure and shared.
- In-memory store + SSE bus assume a single Node process (Railway). Do not deploy to serverless.
- Camera pipeline runs entirely in the browser (MediaPipe WASM). No Socket.IO.
