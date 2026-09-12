"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { isValidCode, normalizeCode } from "@/lib/rail/code";

export default function RailJoin() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const valid = isValidCode(code);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) router.push(`/rail/${code}`);
      }}
      className="flex gap-2"
    >
      <input
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        maxLength={4}
        value={code}
        onChange={(e) => setCode(normalizeCode(e.target.value))}
        placeholder="KXTR"
        className="w-32 rounded-lg border border-felt-edge bg-background px-4 py-3 text-center font-mono text-2xl uppercase tracking-[0.3em]"
      />
      <button disabled={!valid} className="rounded-lg bg-gold px-6 font-medium text-background disabled:opacity-40">Watch</button>
    </form>
  );
}
