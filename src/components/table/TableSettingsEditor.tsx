"use client";

import { Bot, Eye, Mic2, Minus, Plus, Radio, TrendingUp, Users } from "lucide-react";
import { useRef } from "react";
import { tellAudiences, tellVisibilityFor, type TellAudiences } from "@/lib/tells/visibility";
import type { TableConfig } from "@/lib/types";
import styles from "./TableSettingsEditor.module.css";

type NumericKey = "startingStack" | "smallBlind" | "bigBlind" | "handsPerMatch" | "turnTimerSec";

interface Props {
  config: TableConfig;
  disabled?: boolean;
  onUpdate: (patch: Partial<TableConfig>) => void | Promise<unknown>;
}

/** Host-only live rules editor. The server remains authoritative and broadcasts its sanitized config back. */
export default function TableSettingsEditor({ config, disabled = false, onUpdate }: Props) {
  const update = (patch: Partial<TableConfig>) => {
    if (disabled) return;
    void onUpdate(patch);
  };
  const commitNumber = (key: NumericKey, raw: string, minimum: number, maximum: number): number => {
    const parsed = Math.round(Number(raw));
    if (!Number.isFinite(parsed)) return config[key];
    const value = Math.min(maximum, Math.max(minimum, parsed));
    update({ [key]: value });
    return value;
  };
  const audiences = tellAudiences(config.tellVisibility);
  const updateAudience = (audience: keyof TellAudiences, checked: boolean) => {
    update({ tellVisibility: tellVisibilityFor({ ...audiences, [audience]: checked }) });
  };

  return (
    <section className="rounded-3xl border border-felt-edge bg-felt/15 p-5 sm:p-7" aria-labelledby="table-rules-title">
      <div className="mb-5">
        <h2 id="table-rules-title" className="mt-1 text-2xl">Table rules</h2>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <NumberField disabled={disabled} label="Starting stack" value={config.startingStack} min={10} max={100_000_000} step={10} onCommit={(raw) => commitNumber("startingStack", raw, 10, 100_000_000)} />
        <NumberField disabled={disabled} label="Small blind" value={config.smallBlind} min={1} max={1_000_000} onCommit={(raw) => commitNumber("smallBlind", raw, 1, 1_000_000)} />
        <NumberField disabled={disabled} label="Big blind" value={config.bigBlind} min={config.smallBlind} max={2_000_000} onCommit={(raw) => commitNumber("bigBlind", raw, config.smallBlind, 2_000_000)} />
        <NumberField disabled={disabled} label="Number of hands" hint="Enter 0 to play until one stack remains" value={config.handsPerMatch} min={0} max={1000} onCommit={(raw) => commitNumber("handsPerMatch", raw, 0, 1000)} />
        <NumberField disabled={disabled} label="Turn timer (seconds)" hint="0 turns the clock off · maximum 120" value={config.turnTimerSec} min={0} max={120} onCommit={(raw) => commitNumber("turnTimerSec", raw, 0, 120)} />
      </div>

      <div className="mt-6 rounded-2xl border border-felt-edge bg-background/35 p-4 sm:p-5">
        <h3 className="mb-3 flex items-center gap-2 text-base"><Eye size={16} className="text-gold" /> Who can see human tells?</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Toggle disabled={disabled} checked={audiences.ai} onChange={(checked) => updateAudience("ai", checked)} icon={<Bot size={15} className="text-gold" />} title="AI opponents" body="Models can use tells in decisions." />
          <Toggle disabled={disabled} checked={audiences.rail} onChange={(checked) => updateAudience("rail", checked)} icon={<Radio size={15} className="text-gold" />} title="Rail spectators" body="People watching can see live reads." />
          <Toggle disabled={disabled} checked={audiences.humans} onChange={(checked) => updateAudience("humans", checked)} icon={<Users size={15} className="text-gold" />} title="Human players" body="Opponents can see each other’s reads." />
        </div>
      </div>

      <div className="mt-6 border-t border-felt-edge/70 pt-5">
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Toggle disabled={disabled} checked={config.voice} onChange={(voice) => update({ voice })} icon={<Mic2 size={15} className="text-gold" />} title="AI voices" body="Play table talk with vendor voices." />
          <Toggle disabled={disabled} checked={config.allowLateJoin} onChange={(allowLateJoin) => update({ allowLateJoin })} icon={<Users size={15} className="text-gold" />} title="Late joining" body="New players receive a seat on the next hand." />
          <Toggle disabled={disabled} checked={config.predictionMarket} onChange={(predictionMarket) => update({ predictionMarket })} icon={<TrendingUp size={15} className="text-gold" />} title="Rail predictions" body="Let spectators stake devnet SOL on live outcomes." />
        </div>
      </div>
    </section>
  );
}

function Field({ label, icon, hint, children }: { label: string; icon?: React.ReactNode; hint?: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-2"><span className="flex items-center gap-2 text-xs text-muted">{icon}{label}</span>{children}{hint && <span className="text-[10px] text-muted">{hint}</span>}</div>;
}

function NumberField({ label, hint, value, min, max, step, disabled, onCommit }: { label: string; hint?: string; value: number; min: number; max: number; step?: number; disabled?: boolean; onCommit: (raw: string) => number }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const commit = (raw: string) => {
    const next = onCommit(raw);
    if (inputRef.current) inputRef.current.value = String(next);
  };
  const adjust = (direction: -1 | 1) => {
    const raw = inputRef.current?.value ?? String(value);
    const parsed = Number(raw);
    const current = Number.isFinite(parsed) ? parsed : value;
    commit(String(current + direction * (step ?? 1)));
  };

  return (
    <Field label={label} hint={hint}>
      <div className={`flex overflow-hidden rounded-xl border border-felt-edge bg-background transition focus-within:border-gold ${disabled ? "opacity-60" : ""}`}>
        <button type="button" disabled={disabled} aria-label={`Decrease ${label}`} onClick={() => adjust(-1)} className="flex w-11 shrink-0 items-center justify-center border-r border-felt-edge bg-felt/45 text-gold transition hover:bg-gold/15 disabled:cursor-not-allowed"><Minus size={15} /></button>
        <input ref={inputRef} key={value} aria-label={label} disabled={disabled} type="number" defaultValue={value} min={min} max={max} step={step} onBlur={(event) => commit(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} className={`${styles.numberInput} min-w-0 flex-1 bg-transparent px-2 py-2.5 text-center font-mono text-sm outline-none disabled:cursor-not-allowed`} />
        <button type="button" disabled={disabled} aria-label={`Increase ${label}`} onClick={() => adjust(1)} className="flex w-11 shrink-0 items-center justify-center border-l border-felt-edge bg-felt/45 text-gold transition hover:bg-gold/15 disabled:cursor-not-allowed"><Plus size={15} /></button>
      </div>
    </Field>
  );
}

function Toggle({ checked, onChange, icon, title, body, disabled }: { checked: boolean; onChange: (checked: boolean) => void; icon: React.ReactNode; title: string; body: string; disabled?: boolean }) {
  return (
    <label className={`flex items-center justify-between gap-4 rounded-2xl border border-felt-edge p-4 ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
      <span><span className="flex items-center gap-2 font-display text-base">{icon}{title}</span><span className="mt-1 block font-sans text-xs text-muted">{body}</span></span>
      <input type="checkbox" disabled={disabled} checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 shrink-0 accent-gold" />
    </label>
  );
}
