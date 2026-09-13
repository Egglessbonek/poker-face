"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Copy, SlidersHorizontal, Users } from "lucide-react";
import { api, lastName, saveIdentity } from "@/lib/client/identity";
import { DEFAULT_TABLE } from "@/lib/types";

export default function NewTableForm() {
  const router = useRouter();
  const [hostName, setHostName] = useState("");
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
      const result = await api<{ code: string; playerId: string; token: string }>("/api/table", "POST", { config: { ...DEFAULT_TABLE, aiPlayers: [] }, name: hostName });
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
          <p className="text-xs uppercase tracking-[0.32em] text-gold">Open a private table</p>
          <h1 className="max-w-2xl text-5xl tracking-tight sm:text-6xl">Get the room open. Set the game together.</h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted">Your table code appears first, so friends can take their seats while you choose the stakes, models, timer, and tell rules.</p>
          <ul className="mt-3 grid max-w-xl gap-3 text-sm sm:grid-cols-3">
            <Benefit icon={<Copy size={17} />} title="Share immediately" body="Invite players before setup is finished." />
            <Benefit icon={<SlidersHorizontal size={17} />} title="Tune it live" body="Rules update for everyone in the room." />
            <Benefit icon={<Users size={17} />} title="Build the table" body="Add humans and AI guests as you go." />
          </ul>
        </header>

        <form onSubmit={create} className="flex flex-col gap-5 rounded-3xl border border-felt-edge bg-felt/20 p-6 shadow-2xl shadow-black/20 sm:p-8">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-gold">First, introduce yourself</p>
            <h2 className="mt-2 text-3xl">Who is opening the room?</h2>
            <p className="mt-2 text-sm text-muted">This takes you straight into the live setup lobby.</p>
          </div>
          <label className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-wider text-muted">Your name</span>
            <input value={hostName} maxLength={20} placeholder="Host" autoFocus onChange={(event) => setHostName(event.target.value)} className="w-full rounded-xl border border-felt-edge bg-background px-4 py-3 text-base outline-none transition focus:border-gold" />
          </label>
          {error && <p role="alert" className="rounded-xl bg-danger/15 px-4 py-3 text-sm text-danger">{error}</p>}
          <button disabled={creating} className="rounded-full bg-gold px-8 py-3 font-semibold text-background transition hover:brightness-110 disabled:opacity-40">{creating ? "Opening your room…" : "Open the room"}</button>
          <p className="text-center text-[11px] text-muted">A private four-letter code is created with the default rules. Nothing starts until you deal.</p>
        </form>
      </div>
    </main>
  );
}

function Benefit({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return <li className="rounded-2xl border border-felt-edge/70 bg-background/50 p-4"><span className="text-gold">{icon}</span><p className="mt-3 font-medium">{title}</p><p className="mt-1 text-xs leading-relaxed text-muted">{body}</p></li>;
}
