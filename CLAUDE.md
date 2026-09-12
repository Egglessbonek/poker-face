@AGENTS.md

# Poker Face

Hackathon project: heads-up Hold'em vs an AI villain that reads webcam tells. Plan lives in the repo README and the module-level TODO(phase N) comments.

- `npm run dev` / `npm test` (vitest) / `npm run typecheck` / `npm run lint` / `npm run build`
- Shared types are in `src/lib/types.ts`. Add fields there first; every module imports from it.
- Server-only modules (`src/lib/llm`, `src/lib/villain/brain.ts`, `src/lib/store.ts`, `src/lib/rail/bus.ts`) must never be imported from client components.
- In-memory store + SSE bus assume a single Node process (Railway). Do not deploy to serverless.
- Camera pipeline runs entirely in the browser (MediaPipe WASM). No Socket.IO.
