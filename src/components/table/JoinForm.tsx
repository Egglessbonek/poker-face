"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Eye, UserRound } from "lucide-react";
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
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-md flex-col gap-6 rounded-3xl border border-felt-edge bg-felt/15 p-6 text-center sm:p-8">
        <div>
          <p className="text-xs text-gold">Table {code}</p>
          <h1 className="mt-2 text-3xl font-semibold">Take a seat</h1>
          <p className="mt-2 text-sm text-muted">Your name is the only thing the table needs.</p>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="relative">
            <UserRound size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="Your name" autoFocus className="w-full rounded-xl border border-felt-edge bg-background py-3 pl-11 pr-4 outline-none transition focus:border-gold" />
          </label>
        {error && <p className="rounded-lg bg-danger/20 px-3 py-2 text-sm text-danger">{error}</p>}
          <button disabled={busy} className="rounded-full bg-gold py-3 font-semibold text-background disabled:opacity-40">{busy ? "Joining…" : "Sit down"}</button>
          <Link href={`/rail/${code}`} className="flex items-center justify-center gap-2 pt-2 text-xs text-muted hover:text-foreground"><Eye size={13} /> Just watch from the rail</Link>
        </form>
      </div>
    </main>
  );
}
