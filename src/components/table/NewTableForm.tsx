"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Eye, Mic2, Users } from "lucide-react";
import ModelPicker from "@/components/table/ModelPicker";
import { api, lastName, saveIdentity } from "@/lib/client/identity";
import { describeModelId } from "@/lib/llm/models";
import { DEFAULT_TABLE, type TableConfig, type TellVisibility } from "@/lib/types";

const VISIBILITY: Array<{ value: TellVisibility; title: string; body: string }> = [
  { value: "ai_and_rail", title: "AI + rail", body: "AI opponents and spectators see live human tells." },
  { value: "everyone", title: "Everyone", body: "Players, AIs, and the rail can see opponent tells." },
  { value: "ai_only", title: "AI only", body: "Only the models at the table receive human tells." },
  { value: "rail_only", title: "Rail only", body: "Spectators get the read; players and AIs do not." },
  { value: "off", title: "Off", body: "No live tells are shared during the match." },
];

export default function NewTableForm() {
  const router = useRouter();
  const [hostName, setHostName] = useState("");
  const [config, setConfig] = useState<TableConfig>(DEFAULT_TABLE);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => setHostName(lastName()), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const set = <K extends keyof TableConfig>(key: K, value: TableConfig[K]) => setConfig((current) => ({ ...current, [key]: value }));
  const seatsNeeded = 1 + config.aiPlayers.length;

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const result = await api<{ code: string; playerId: string; token: string }>("/api/table", "POST", { config, name: hostName });
      saveIdentity(result.code, { playerId: result.playerId, token: result.token, name: hostName.trim() || "Host" });
      router.push(`/table/${result.code}`);
    } catch (reason) {
      setError((reason as Error).message);
      setCreating(false);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8 sm:px-8">
      <header className="flex flex-col gap-3">
        <p className="text-xs uppercase tracking-[0.32em] text-gold">Open a private table</p>
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">Your game, your stakes, your tells.</h1>
        <p className="max-w-2xl text-muted">Set the house rules, then share one four-letter code with players and the rail.</p>
      </header>

      <form onSubmit={create} className="flex flex-col gap-5">
        <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-3xl border border-felt-edge bg-felt/20 p-5 sm:p-7">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Your name" wide>
                <input value={hostName} maxLength={20} placeholder="Host" onChange={(event) => setHostName(event.target.value)} className={inputClass} />
              </Field>
              <Field label="Seats" icon={<Users size={16} />}>
                <select value={config.maxSeats} onChange={(event) => set("maxSeats", Number(event.target.value))} className={inputClass}>
                  {Array.from({ length: 8 }, (_, index) => index + 2).map((value) => <option key={value} value={value} disabled={value < seatsNeeded}>{value} seats</option>)}
                </select>
              </Field>
              <Field label="Starting stack">
                <input type="number" min={10} step={10} value={config.startingStack} onChange={(event) => set("startingStack", Number(event.target.value))} className={inputClass} />
              </Field>
              <Field label="Small blind">
                <input type="number" min={1} value={config.smallBlind} onChange={(event) => set("smallBlind", Number(event.target.value))} className={inputClass} />
              </Field>
              <Field label="Big blind">
                <input type="number" min={config.smallBlind} value={config.bigBlind} onChange={(event) => set("bigBlind", Number(event.target.value))} className={inputClass} />
              </Field>
              <Field label="Hands" hint="0 plays until one stack remains">
                <input type="number" min={0} max={1000} value={config.handsPerMatch} onChange={(event) => set("handsPerMatch", Number(event.target.value))} className={inputClass} />
              </Field>
              <Field label="Turn timer" hint="0 turns the clock off">
                <select value={config.turnTimerSec} onChange={(event) => set("turnTimerSec", Number(event.target.value))} className={inputClass}>
                  {[0, 10, 15, 20, 30, 45, 60].map((value) => <option key={value} value={value}>{value ? `${value} seconds` : "No timer"}</option>)}
                </select>
              </Field>
            </div>

            <div className="mt-7 border-t border-felt-edge/70 pt-6">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium"><Eye size={16} className="text-gold" /> Who can see human tells?</div>
              <div className="grid gap-3 sm:grid-cols-2">
                {VISIBILITY.map((option) => <Choice key={option.value} active={config.tellVisibility === option.value} title={option.title} body={option.body} onClick={() => set("tellVisibility", option.value)} />)}
              </div>
            </div>
          </section>

          <aside className="flex flex-col gap-5 rounded-3xl border border-felt-edge p-5 sm:p-7">
            <div>
              <div className="mb-1 flex items-center gap-2 text-sm font-medium"><Bot size={16} className="text-gold" /> Invite the models</div>
              <p className="text-xs leading-relaxed text-muted">Every AI plays as itself through OpenRouter. Duplicates are allowed.</p>
            </div>

            <ul className="flex flex-col gap-2">
              {config.aiPlayers.map((id, index) => {
                const model = describeModelId(id);
                return (
                  <li key={`${id}-${index}`} className="flex items-center gap-3 rounded-2xl border border-gold/40 bg-gold/5 p-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chip-blue/60"><Bot size={16} /></div>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{model.label}</p><p className="truncate text-[10px] text-muted">{model.vendor} · {id}</p></div>
                    <button type="button" aria-label={`Remove ${model.label}`} onClick={() => set("aiPlayers", config.aiPlayers.filter((_, itemIndex) => itemIndex !== index))} className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-danger/10 hover:text-danger">×</button>
                  </li>
                );
              })}
              {config.aiPlayers.length === 0 && <li className="rounded-2xl border border-dashed border-felt-edge p-4 text-center text-xs text-muted">No AI seats yet. Humans can fill the table.</li>}
            </ul>

            <ModelPicker onAdd={(id) => set("aiPlayers", [...config.aiPlayers, id])} disabled={seatsNeeded >= config.maxSeats} />

            <label className="mt-auto flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-felt-edge p-4">
              <span><span className="flex items-center gap-2 text-sm font-medium"><Mic2 size={15} className="text-gold" /> AI voices</span><span className="mt-1 block text-xs text-muted">Play table talk with vendor voices.</span></span>
              <input type="checkbox" checked={config.voice} onChange={(event) => set("voice", event.target.checked)} className="h-5 w-5 accent-gold" />
            </label>
            <label className="flex cursor-pointer items-center gap-3 text-xs text-muted">
              <input type="checkbox" checked={config.allowLateJoin} onChange={(event) => set("allowLateJoin", event.target.checked)} className="h-4 w-4 accent-gold" />
              Late joiners receive a seat next hand
            </label>
          </aside>
        </div>

        {error && <p className="rounded-xl bg-danger/15 px-4 py-3 text-sm text-danger">{error}</p>}
        <footer className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-felt-edge bg-background/80 p-4 sm:flex-row">
          <p className="text-sm text-muted"><span className="text-foreground">{config.maxSeats} seats</span> · {config.smallBlind}/{config.bigBlind} blinds · {config.handsPerMatch || "unlimited"} hands · {config.turnTimerSec ? `${config.turnTimerSec}s clock` : "no clock"}</p>
          <button disabled={creating || config.bigBlind < config.smallBlind || seatsNeeded > config.maxSeats} className="w-full rounded-full bg-gold px-8 py-3 font-semibold text-background transition hover:brightness-110 disabled:opacity-40 sm:w-auto">{creating ? "Opening table…" : "Create table"}</button>
        </footer>
      </form>
    </main>
  );
}

const inputClass = "w-full rounded-xl border border-felt-edge bg-background px-3 py-2.5 text-sm outline-none transition focus:border-gold";

function Field({ label, icon, hint, wide, children }: { label: string; icon?: React.ReactNode; hint?: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={`flex flex-col gap-2 ${wide ? "sm:col-span-2" : ""}`}><span className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted">{icon}{label}</span>{children}{hint && <span className="text-[10px] text-muted">{hint}</span>}</label>;
}

function Choice({ active, title, body, onClick }: { active: boolean; title: string; body: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`rounded-2xl border p-4 text-left transition ${active ? "border-gold bg-gold/10" : "border-felt-edge hover:border-gold/50"}`}><span className="text-sm font-medium">{title}</span><span className="mt-1 block text-xs text-muted">{body}</span></button>;
}
