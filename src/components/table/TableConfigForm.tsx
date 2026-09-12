"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, lastName, saveIdentity } from "@/lib/client/identity";
import { PERSONAS } from "@/lib/villain/personas";
import { DEFAULT_TABLE, type TableConfig, type TellVisibility } from "@/lib/types";

export const VISIBILITY_LABEL: Record<TellVisibility, string> = {
  ai_and_rail: "AI players and the rail",
  everyone: "Everyone at the table",
  ai_only: "AI players only",
  rail_only: "The rail only",
  off: "Nobody (tells off)",
};

export default function TableConfigForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [cfg, setCfg] = useState<TableConfig>(DEFAULT_TABLE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setName(lastName()), 0);
    return () => clearTimeout(id);
  }, []);

  const set = <K extends keyof TableConfig>(k: K, v: TableConfig[K]) => setCfg((c) => ({ ...c, [k]: v }));
  const toggleAI = (id: string) => set("aiPlayers", cfg.aiPlayers.includes(id) ? cfg.aiPlayers.filter((x) => x !== id) : [...cfg.aiPlayers, id]);
  const seatsNeeded = 1 + cfg.aiPlayers.length;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ code: string; playerId: string; token: string }>("/api/table", "POST", { config: cfg, name });
      saveIdentity(r.code, { playerId: r.playerId, token: r.token, name: name.trim() || "Host" });
      router.push(`/table/${r.code}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <Field label="Your name">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="Host" className={input} />
      </Field>

      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="Seats" hint={`${seatsNeeded} taken by you and the AI players`}>
          <input type="number" min={Math.max(2, seatsNeeded)} max={9} value={cfg.maxSeats} onChange={(e) => set("maxSeats", Number(e.target.value))} className={input} />
        </Field>
        <Field label="Starting stack">
          <input type="number" min={10} step={10} value={cfg.startingStack} onChange={(e) => set("startingStack", Number(e.target.value))} className={input} />
        </Field>
        <Field label="Small blind">
          <input type="number" min={1} value={cfg.smallBlind} onChange={(e) => set("smallBlind", Number(e.target.value))} className={input} />
        </Field>
        <Field label="Big blind">
          <input type="number" min={cfg.smallBlind} value={cfg.bigBlind} onChange={(e) => set("bigBlind", Number(e.target.value))} className={input} />
        </Field>
        <Field label="Hands" hint="0 = until one player has all the chips">
          <input type="number" min={0} max={1000} value={cfg.handsPerMatch} onChange={(e) => set("handsPerMatch", Number(e.target.value))} className={input} />
        </Field>
        <Field label="Turn timer (seconds)" hint="0 = no timer">
          <input type="number" min={0} max={600} value={cfg.turnTimerSec} onChange={(e) => set("turnTimerSec", Number(e.target.value))} className={input} />
        </Field>
      </section>

      <Field label="Who sees the tells" hint="Humans never see their own tells during play. Everyone sees everything in the reveal.">
        <select value={cfg.tellVisibility} onChange={(e) => set("tellVisibility", e.target.value as TellVisibility)} className={input}>
          {(Object.keys(VISIBILITY_LABEL) as TellVisibility[]).map((v) => (
            <option key={v} value={v}>{VISIBILITY_LABEL[v]}</option>
          ))}
        </select>
      </Field>

      <Field label="AI players">
        <div className="grid gap-2 sm:grid-cols-3">
          {PERSONAS.map((p) => {
            const on = cfg.aiPlayers.includes(p.id);
            return (
              <button type="button" key={p.id} onClick={() => toggleAI(p.id)} className={`flex flex-col gap-1 rounded-xl border p-3 text-left transition ${on ? "border-gold bg-gold/10" : "border-felt-edge"}`} aria-pressed={on}>
                <span className="font-semibold">{p.name}</span>
                <span className="text-xs text-muted">{p.tagline}</span>
              </button>
            );
          })}
        </div>
      </Field>

      <div className="flex flex-wrap gap-6">
        <Toggle label="Late joiners get a seat next hand" checked={cfg.allowLateJoin} onChange={(v) => set("allowLateJoin", v)} />
        <Toggle label="AI table talk with voice" checked={cfg.voice} onChange={(v) => set("voice", v)} />
      </div>

      {error && <p className="rounded-lg bg-danger/20 px-3 py-2 text-sm text-danger">{error}</p>}
      <button disabled={busy} className="rounded-xl bg-gold py-3 font-medium text-background disabled:opacity-40">{busy ? "Opening the table…" : "Open the table"}</button>
    </form>
  );
}

const input = "w-full rounded-lg border border-felt-edge bg-background px-3 py-2 text-sm";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-gold" />
      {label}
    </label>
  );
}
