"use client";

import { useCodeEntry } from "@/hooks/useCodeEntry";

export default function RailJoin() {
  const { code, setCode, valid, checking, error, submit } = useCodeEntry("watch");
  return (
    <form onSubmit={submit} className="flex flex-col items-center gap-2">
      <div className="flex gap-2">
        <input
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={4}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="KXTR"
          aria-label="Table code"
          aria-invalid={!!error}
          className="w-32 rounded-lg border border-felt-edge bg-background px-4 py-3 text-center font-mono text-2xl uppercase tracking-[0.3em]"
        />
        <button disabled={!valid || checking} className="rounded-lg bg-gold px-6 font-medium text-background disabled:opacity-40">{checking ? "Checking…" : "Watch"}</button>
      </div>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </form>
  );
}
