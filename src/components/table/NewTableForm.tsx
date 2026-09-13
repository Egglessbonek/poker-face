"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Globe2, Lock } from "lucide-react";
import { api, lastName, saveIdentity } from "@/lib/client/identity";
import { DEFAULT_TABLE } from "@/lib/types";

export default function NewTableForm() {
  const router = useRouter();
  const [hostName, setHostName] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => setHostName(lastName()), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setCreating(true);
    setError(null);
    try {
      // Open the room before configuring it so invitees can arrive while the host sets the rules.
      // AI seats start empty; the live lobby offers the same presets and full model catalog.
      const result = await api<{ code: string; playerId: string; token: string }>("/api/table", "POST", { config: { ...DEFAULT_TABLE, aiPlayers: [] }, name: hostName, isPublic });
      saveIdentity(result.code, { playerId: result.playerId, token: result.token, name: hostName.trim() || "Host" });
      router.replace(`/table/${result.code}`);
    } catch (reason) {
      setError((reason as Error).message);
      setCreating(false);
      submitting.current = false;
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-8 sm:px-8">
      <Link href="/" className="mb-10 flex w-fit items-center gap-2 text-sm text-muted hover:text-foreground"><ArrowLeft size={15} /> Back</Link>
      <div className="grid flex-1 items-center gap-10 lg:grid-cols-[1fr_0.8fr]">
        <header className="flex flex-col gap-4">
          <h1 className="max-w-2xl text-5xl tracking-tight sm:text-6xl">Set the game.</h1>
        </header>

        <form onSubmit={create} className="flex flex-col gap-5 rounded-3xl border border-felt-edge bg-felt/20 p-6 shadow-2xl shadow-black/20 sm:p-8">
          <label className="flex flex-col gap-2">
            <span className="text-xs text-muted">Your name</span>
            <input value={hostName} maxLength={20} placeholder="Host" autoFocus onChange={(event) => setHostName(event.target.value)} className="w-full rounded-xl border border-felt-edge bg-background px-4 py-3 text-base outline-none transition focus:border-gold" />
          </label>
          <button type="button" aria-pressed={isPublic} onClick={() => setIsPublic((current) => !current)} className="flex min-h-24 items-center justify-between gap-4 rounded-2xl border border-felt-edge bg-background/35 p-4 text-left transition hover:border-gold">
            <span className="flex min-w-0 items-center gap-3">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${isPublic ? "bg-ok/15 text-ok" : "bg-felt-edge/60 text-muted"}`}>{isPublic ? <Globe2 size={17} /> : <Lock size={17} />}</span>
              <span><span className="block text-sm font-medium">{isPublic ? "Public table" : "Private table"}</span></span>
            </span>
            <span aria-hidden="true" className={`relative h-6 w-11 shrink-0 rounded-full transition ${isPublic ? "bg-ok" : "bg-felt-edge"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${isPublic ? "translate-x-6" : "translate-x-1"}`} /></span>
          </button>
          {error && <p role="alert" className="rounded-xl bg-danger/15 px-4 py-3 text-sm text-danger">{error}</p>}
          <button disabled={creating} className="rounded-full bg-gold px-8 py-3 font-semibold text-background transition hover:brightness-110 disabled:opacity-40">{creating ? "Opening your room…" : "Open the room"}</button>
        </form>
      </div>
    </main>
  );
}
