"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, lastName, saveIdentity, type Identity } from "@/lib/client/identity";

export default function JoinForm({ code, onJoined }: { code: string; onJoined: (id: Identity) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setName(lastName()), 0);
    return () => clearTimeout(id);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ playerId: string; token: string }>(`/api/table/${code}/join`, "POST", { name });
      const id = { playerId: r.playerId, token: r.token, name: name.trim() || "Player" };
      saveIdentity(code, id);
      onJoined(id);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16">
      <p className="text-xs uppercase tracking-[0.3em] text-gold">Table {code}</p>
      <h1 className="text-3xl font-semibold">Take a seat</h1>
      <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-3">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="Your name" autoFocus className="rounded-lg border border-felt-edge bg-background px-4 py-3" />
        {error && <p className="rounded-lg bg-danger/20 px-3 py-2 text-sm text-danger">{error}</p>}
        <button disabled={busy} className="rounded-xl bg-gold py-3 font-medium text-background disabled:opacity-40">{busy ? "Joining…" : "Sit down"}</button>
        <Link href={`/rail/${code}`} className="text-center text-xs text-muted underline">Just watch from the rail instead</Link>
      </form>
    </main>
  );
}
