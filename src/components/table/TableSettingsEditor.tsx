"use client";

import { Bot, Eye, Mic2, Radio, Users } from "lucide-react";
import { tellAudiences, tellVisibilityFor, type TellAudiences } from "@/lib/tells/visibility";
import type { TableConfig } from "@/lib/types";

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
        <p className="text-xs uppercase tracking-[0.24em] text-gold">House rules</p>
        <h2 id="table-rules-title" className="mt-1 text-2xl">Set the game while everyone arrives</h2>
        <p className="mt-1 text-xs text-muted">{disabled ? "The host can update these rules until the first deal." : "Changes are live for everyone in the room and lock when you deal."}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <NumberField disabled={disabled} label="Starting stack" value={config.startingStack} min={10} max={100_000_000} step={10} onCommit={(raw) => commitNumber("startingStack", raw, 10, 100_000_000)} />
        <NumberField disabled={disabled} label="Small blind" value={config.smallBlind} min={1} max={1_000_000} onCommit={(raw) => commitNumber("smallBlind", raw, 1, 1_000_000)} />
        <NumberField disabled={disabled} label="Big blind" value={config.bigBlind} min={config.smallBlind} max={2_000_000} onCommit={(raw) => commitNumber("bigBlind", raw, config.smallBlind, 2_000_000)} />
        <NumberField disabled={disabled} label="Number of hands" hint="Enter 0 to play until one stack remains" value={config.handsPerMatch} min={0} max={1000} onCommit={(raw) => commitNumber("handsPerMatch", raw, 0, 1000)} />
        <NumberField disabled={disabled} label="Turn timer (seconds)" hint="0 turns the clock off · maximum 120" value={config.turnTimerSec} min={0} max={120} onCommit={(raw) => commitNumber("turnTimerSec", raw, 0, 120)} />
      </div>

      <div className="mt-6 rounded-2xl border border-felt-edge bg-background/35 p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium"><Eye size={16} className="text-gold" /> Who can see human tells?</div>
        <p className="mb-3 text-xs text-muted">Choose each audience independently. Players never see their own private read.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Toggle disabled={disabled} checked={audiences.ai} onChange={(checked) => updateAudience("ai", checked)} icon={<Bot size={15} className="text-gold" />} title="AI opponents" body="Models can use tells in decisions." />
          <Toggle disabled={disabled} checked={audiences.rail} onChange={(checked) => updateAudience("rail", checked)} icon={<Radio size={15} className="text-gold" />} title="Rail spectators" body="People watching can see live reads." />
          <Toggle disabled={disabled} checked={audiences.humans} onChange={(checked) => updateAudience("humans", checked)} icon={<Users size={15} className="text-gold" />} title="Human players" body="Opponents can see each other’s reads." />
        </div>
      </div>

      <div className="mt-6 border-t border-felt-edge/70 pt-5">
        <p className="text-xs uppercase tracking-[0.2em] text-gold">Table behavior</p>
        <p className="mt-1 text-xs text-muted">Control the table experience separately from tell sharing.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Toggle disabled={disabled} checked={config.voice} onChange={(voice) => update({ voice })} icon={<Mic2 size={15} className="text-gold" />} title="AI voices" body="Play table talk with vendor voices." />
          <Toggle disabled={disabled} checked={config.allowLateJoin} onChange={(allowLateJoin) => update({ allowLateJoin })} icon={<Users size={15} className="text-gold" />} title="Late joining" body="New players receive a seat on the next hand." />
        </div>
      </div>
    </section>
  );
}

const inputClass = "w-full rounded-xl border border-felt-edge bg-background px-3 py-2.5 text-sm outline-none transition focus:border-gold";

function Field({ label, icon, hint, children }: { label: string; icon?: React.ReactNode; hint?: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-2"><span className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted">{icon}{label}</span>{children}{hint && <span className="text-[10px] text-muted">{hint}</span>}</label>;
}

function NumberField({ label, hint, value, min, max, step, disabled, onCommit }: { label: string; hint?: string; value: number; min: number; max: number; step?: number; disabled?: boolean; onCommit: (raw: string) => number }) {
  return (
    <Field label={label} hint={hint}>
      <input key={value} disabled={disabled} type="number" defaultValue={value} min={min} max={max} step={step} onBlur={(event) => { event.currentTarget.value = String(onCommit(event.currentTarget.value)); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-60`} />
    </Field>
  );
}

function Toggle({ checked, onChange, icon, title, body, disabled }: { checked: boolean; onChange: (checked: boolean) => void; icon: React.ReactNode; title: string; body: string; disabled?: boolean }) {
  return (
    <label className={`flex items-center justify-between gap-4 rounded-2xl border border-felt-edge p-4 ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
      <span><span className="flex items-center gap-2 text-sm font-medium">{icon}{title}</span><span className="mt-1 block text-xs text-muted">{body}</span></span>
      <input type="checkbox" disabled={disabled} checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 shrink-0 accent-gold" />
    </label>
  );
}
