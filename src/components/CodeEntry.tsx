"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { isValidCode } from "@/lib/rail/code";

export default function CodeEntry({ title, hint, hrefPrefix, label }: { title: string; hint: string; hrefPrefix: string; label: string }) {
  const [code, setCode] = useState("");
  const router = useRouter();
  const valid = isValidCode(code);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) router.push(`${hrefPrefix}${code}`);
      }}
      className="flex flex-col gap-2 rounded-2xl border border-felt-edge p-5 text-left"
    >
      <span className="text-xs uppercase tracking-widest text-muted">Code</span>
      <span className="text-xl font-semibold">{title}</span>
      <span className="text-sm text-muted">{hint}</span>
      <div className="mt-2 flex gap-2">
        <input
          inputMode="numeric"
          maxLength={4}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          placeholder="4821"
          aria-label="Table code"
          className="w-28 rounded-lg border border-felt-edge bg-background px-3 py-2 text-center font-mono text-xl tracking-[0.3em]"
        />
        <button disabled={!valid} className="flex-1 rounded-lg bg-gold font-medium text-background disabled:opacity-40">{label}</button>
      </div>
    </form>
  );
}
