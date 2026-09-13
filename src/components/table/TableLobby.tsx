"use client";

import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Bot, CameraOff, CheckCircle2, CircleAlert, CircleDashed, Copy, Crown, LoaderCircle, LogOut, QrCode, Trash2, Users, X } from "lucide-react";
import ModelPicker from "@/components/table/ModelPicker";
import TableSettingsEditor from "@/components/table/TableSettingsEditor";
import { TIERS, describeModelId } from "@/lib/llm/models";
import type { LobbyCameraStatus, TableConfig, TableState } from "@/lib/types";

interface Props {
  state: TableState;
  playerId: string;
  error?: string | null;
  cameraStatuses: Record<string, LobbyCameraStatus>;
  readyPlayers: Record<string, boolean>;
  ownCameraStatus: LobbyCameraStatus;
  onReadyChange: (ready: boolean) => void | Promise<unknown>;
  onOpenCamera: () => void;
  onAddAI: (modelId: string) => void | Promise<unknown>;
  onRemove: (playerId: string) => void | Promise<unknown>;
  onUpdateConfig: (config: Partial<TableConfig>) => Promise<unknown>;
  onStart: () => void;
  onLeave: () => void;
}

export default function TableLobby({ state, playerId, error, cameraStatuses, readyPlayers, ownCameraStatus, onReadyChange, onOpenCamera, onAddAI, onRemove, onUpdateConfig, onStart, onLeave }: Props) {
  const isHost = state.hostId === playerId;
  const minimumSeats = Math.max(2, state.players.length);
  const openSeats = state.config.maxSeats - state.players.length;
  const aiPlayers = state.players.filter((player) => player.kind === "ai");
  const humanPlayers = state.players.filter((player) => player.kind === "human");
  const unfinishedCamera = humanPlayers.filter((player) => !["ready", "skipped"].includes(cameraStatuses[player.id] ?? "not_started"));
  const unreadyPlayers = humanPlayers.filter((player) => !readyPlayers[player.id]);
  const ownReady = !!readyPlayers[playerId];
  const [rosterBusy, setRosterBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showStartWarning, setShowStartWarning] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveRevision = useRef(0);
  const saveTimer = useRef<number | null>(null);
  const inviteUrl = typeof window === "undefined" ? `/table/${state.code}` : `${window.location.origin}/table/${state.code}`;
  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 2200);
    return () => window.clearTimeout(timeout);
  }, [copied]);
  useEffect(() => () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
  }, []);

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const updateRoster = async (operation: () => void | Promise<unknown>) => {
    if (rosterBusy) return;
    setRosterBusy(true);
    try {
      await operation();
    } finally {
      setRosterBusy(false);
    }
  };
  const addPreset = (modelIds: string[]) => updateRoster(async () => {
    for (const modelId of modelIds) await onAddAI(modelId);
  });
  const updateConfig = async (config: Partial<TableConfig>) => {
    const revision = ++saveRevision.current;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    setSaveStatus("saving");
    try {
      await onUpdateConfig(config);
      if (revision !== saveRevision.current) return;
      setSaveStatus("saved");
      saveTimer.current = window.setTimeout(() => setSaveStatus("idle"), 2200);
    } catch {
      if (revision === saveRevision.current) setSaveStatus("error");
    }
  };
  const requestStart = () => {
    if (unfinishedCamera.length || unreadyPlayers.length) setShowStartWarning(true);
    else onStart();
  };

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-4 py-8 sm:px-8">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-gold">The room is open</p>
            <h1 className="mt-2 text-4xl font-semibold">Table <span className="font-mono text-gold">{state.code}</span></h1>
            <p className="mt-2 text-sm text-muted">Share the code now. Seats, guests, and rules stay live while everyone gets ready.</p>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowQR(true)} className="flex flex-1 items-center justify-center gap-2 rounded-full border border-felt-edge px-4 py-2.5 text-sm transition hover:border-gold"><QrCode size={15} /> QR code</button>
              <button type="button" onClick={copyInvite} className={`flex flex-1 items-center justify-center gap-2 rounded-full border px-4 py-2.5 text-sm transition ${copied ? "border-ok text-ok" : "border-felt-edge hover:border-gold"}`}><Copy size={15} /> {copied ? "Copied" : "Copy invite"}</button>
            </div>
            {isHost && <SaveIndicator status={saveStatus} />}
          </div>
        </header>

        {error && <p role="alert" className="rounded-xl bg-danger/15 px-4 py-3 text-sm text-danger">{error}</p>}

        <section className="rounded-3xl border border-felt-edge bg-felt/20 p-5 sm:p-7" aria-labelledby="capacity-title">
          <div className="flex items-end justify-between gap-4">
            <div><p className="text-xs uppercase tracking-[0.24em] text-gold">Table capacity</p><h2 id="capacity-title" className="mt-1 text-2xl">{state.config.maxSeats} seats</h2></div>
            <p className="text-right text-xs text-muted">{state.players.length} seated · {openSeats} open</p>
          </div>
          {isHost ? (
            <div className="mt-5">
              <input type="range" aria-label="Maximum number of seats" min={minimumSeats} max={9} step={1} defaultValue={state.config.maxSeats} onChange={(event) => void updateConfig({ maxSeats: Number(event.target.value) })} className="w-full accent-gold" />
              <div className="mt-1 flex justify-between font-mono text-[10px] text-muted"><span>{minimumSeats} minimum now</span><span>9 maximum</span></div>
            </div>
          ) : <p className="mt-4 text-xs text-muted">Only the host can change the table capacity.</p>}
        </section>

        <section className="rounded-3xl border border-felt-edge bg-felt/20 p-5 sm:p-7">
          <div className="mb-5 flex items-center justify-between">
            <div><h2 className="flex items-center gap-2 font-medium"><Users size={17} className="text-gold" /> Live guest list</h2><p className="mt-1 text-xs text-muted">Camera readiness and seats update while people follow your invite.</p></div>
            <span className="font-mono text-xs text-muted">{state.players.length}/{state.config.maxSeats}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[...state.players].sort((a, b) => a.seat - b.seat).map((player) => {
              const model = player.modelId ? describeModelId(player.modelId) : null;
              const cameraStatus = cameraStatuses[player.id] ?? "not_started";
              return (
                <div key={player.id} className="flex min-h-24 items-center gap-3 rounded-2xl border border-felt-edge bg-background/50 p-3">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${player.kind === "ai" ? "bg-chip-blue/60" : "bg-felt-edge"}`}>{player.kind === "ai" ? <Bot size={19} /> : player.name.slice(0, 1).toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium">{player.name}{player.id === playerId && <span className="text-xs text-muted">(you)</span>}{player.id === state.hostId && <Crown size={13} className="shrink-0 text-gold" />}</p>
                    <p className="truncate text-xs text-muted">{model ? `${model.vendor} · ${player.modelId}` : player.connected ? "Human · connected" : "Human · reconnecting"}</p>
                    {player.kind === "human" && <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1"><CameraBadge status={cameraStatus} /><ReadyBadge ready={!!readyPlayers[player.id]} /></div>}
                  </div>
                  {isHost && player.id !== state.hostId && <button type="button" disabled={rosterBusy} aria-label={`Remove ${player.name}`} onClick={() => void updateRoster(() => onRemove(player.id))} className="rounded-lg p-2 text-muted hover:bg-danger/10 hover:text-danger disabled:opacity-40"><Trash2 size={15} /></button>}
                </div>
              );
            })}
            {Array.from({ length: openSeats }, (_, index) => <div key={index} className="flex min-h-24 items-center justify-center rounded-2xl border border-dashed border-felt-edge text-xs text-muted">Open seat</div>)}
          </div>

          {isHost && openSeats > 0 && (
            <div className="mt-5 border-t border-felt-edge/60 pt-5">
              {aiPlayers.length === 0 && (
                <div className="mb-5">
                  <p className="mb-2 text-xs uppercase tracking-[0.2em] text-gold">Seat a ready-made table</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {TIERS.map((tier) => {
                      const models = tier.modelIds.slice(0, 3);
                      const unavailable = rosterBusy || openSeats < models.length;
                      return <button type="button" key={tier.id} disabled={unavailable} title={openSeats < models.length ? `Needs ${models.length} open seats` : undefined} onClick={() => void addPreset(models)} className="rounded-xl border border-felt-edge px-3 py-2.5 text-left transition hover:border-gold disabled:cursor-not-allowed disabled:opacity-40"><span className="text-sm font-medium">{tier.label}</span><span className="mt-0.5 block text-[10px] leading-relaxed text-muted">{tier.blurb} Seats three models.</span></button>;
                    })}
                  </div>
                </div>
              )}
              <ModelPicker onAdd={(modelId) => void updateRoster(() => onAddAI(modelId))} disabled={rosterBusy} />
              {rosterBusy && <p className="mt-3 flex items-center gap-2 text-xs text-gold"><LoaderCircle size={13} className="animate-spin" /> Updating the guest list…</p>}
            </div>
          )}
        </section>

        <TableSettingsEditor config={state.config} disabled={!isHost} onUpdate={updateConfig} />

        <footer className="flex flex-col gap-4 rounded-3xl border border-felt-edge bg-background/90 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted">Your camera</p>
              <div className="mt-1 flex flex-wrap items-center gap-3"><CameraBadge status={ownCameraStatus} /><button type="button" onClick={onOpenCamera} className="text-xs text-gold underline underline-offset-4">{ownCameraStatus === "ready" ? "Review camera" : "Set up camera"}</button></div>
            </div>
            <button type="button" aria-pressed={ownReady} onClick={() => void onReadyChange(!ownReady)} className={`flex items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm transition ${ownReady ? "border-ok bg-ok/10 text-ok" : "border-felt-edge hover:border-gold"}`}><CheckCircle2 size={15} /> {ownReady ? "Ready" : "I’m ready"}</button>
          </div>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
            <button type="button" onClick={onLeave} className="flex items-center justify-center gap-2 px-4 py-2 text-xs text-muted hover:text-foreground"><LogOut size={13} /> {isHost ? "Close table" : "Leave table"}</button>
            {isHost ? <div className="text-center"><p className="mb-1 text-[10px] text-muted">{humanPlayers.length - unreadyPlayers.length}/{humanPlayers.length} humans ready</p><button type="button" onClick={requestStart} disabled={state.players.length < 2 || rosterBusy} className="rounded-full bg-gold px-8 py-3 font-semibold text-background disabled:opacity-40">Deal the first hand</button></div> : <p className="rounded-2xl border border-felt-edge px-5 py-3 text-center text-xs text-muted">The host will deal when everyone is ready.</p>}
          </div>
        </footer>
      </main>

      {showStartWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-labelledby="ready-warning-title">
          <div className="w-full max-w-md rounded-3xl border border-felt-edge bg-background p-6 shadow-2xl">
            <CameraOff size={24} className="text-gold" />
            <h2 id="ready-warning-title" className="mt-4 text-2xl">Some players are still getting ready</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted">
              {unreadyPlayers.length > 0 && <p><span className="font-medium text-foreground">Not marked ready:</span> {unreadyPlayers.map((player) => player.name).join(", ")}.</p>}
              {unfinishedCamera.length > 0 && <p><span className="font-medium text-foreground">Camera setup unfinished:</span> {unfinishedCamera.map((player) => player.name).join(", ")}. They can still play, but their tells may be unavailable.</p>}
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" autoFocus onClick={() => setShowStartWarning(false)} className="rounded-full border border-felt-edge px-5 py-2.5 text-sm">Go back</button>
              <button type="button" onClick={() => { setShowStartWarning(false); onStart(); }} className="rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-background">Start anyway</button>
            </div>
          </div>
        </div>
      )}

      {showQR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-labelledby="invite-qr-title">
          <div className="relative flex w-full max-w-sm flex-col items-center rounded-3xl border border-felt-edge bg-background p-6 text-center shadow-2xl">
            <button type="button" autoFocus onClick={() => setShowQR(false)} aria-label="Close QR code" className="absolute right-4 top-4 rounded-full p-2 text-muted transition hover:bg-felt/40 hover:text-foreground"><X size={18} /></button>
            <p className="text-xs uppercase tracking-[0.24em] text-gold">Scan to join</p>
            <h2 id="invite-qr-title" className="mt-2 text-2xl">Table <span className="font-mono text-gold">{state.code}</span></h2>
            <div className="mt-5 rounded-2xl bg-white p-3"><QRCodeSVG value={inviteUrl} size={220} level="M" title={`Join table ${state.code}`} /></div>
            <p className="mt-4 max-w-full break-all font-mono text-[10px] text-muted">{inviteUrl}</p>
            <button type="button" onClick={copyInvite} className={`mt-5 flex items-center justify-center gap-2 rounded-full border px-5 py-2.5 text-sm transition ${copied ? "border-ok text-ok" : "border-felt-edge hover:border-gold"}`}><Copy size={15} /> {copied ? "Copied" : "Copy invite"}</button>
          </div>
        </div>
      )}
    </>
  );
}

const cameraDetails: Record<LobbyCameraStatus, { label: string; className: string; icon: React.ReactNode }> = {
  not_started: { label: "Camera not set up", className: "text-muted", icon: <CircleDashed size={13} /> },
  setting_up: { label: "Setting up camera", className: "text-gold", icon: <LoaderCircle size={13} className="animate-spin" /> },
  skipped: { label: "Camera skipped", className: "text-muted", icon: <CameraOff size={13} /> },
  ready: { label: "Camera ready", className: "text-ok", icon: <CheckCircle2 size={13} /> },
};

function CameraBadge({ status }: { status: LobbyCameraStatus }) {
  const detail = cameraDetails[status];
  return <span className={`inline-flex items-center gap-1.5 text-[11px] ${detail.className}`}>{detail.icon}{detail.label}</span>;
}

function ReadyBadge({ ready }: { ready: boolean }) {
  return <span className={`inline-flex items-center gap-1.5 text-[11px] ${ready ? "text-ok" : "text-muted"}`}>{ready ? <CheckCircle2 size={13} /> : <CircleDashed size={13} />}{ready ? "Ready" : "Not ready"}</span>;
}

function SaveIndicator({ status }: { status: "idle" | "saving" | "saved" | "error" }) {
  if (status === "idle") return <span aria-live="polite" className="h-4 text-[11px] text-muted" />;
  const detail = status === "saving"
    ? { label: "Saving rules…", icon: <LoaderCircle size={12} className="animate-spin" />, className: "text-muted" }
    : status === "saved"
      ? { label: "Rules updated", icon: <CheckCircle2 size={12} />, className: "text-ok" }
      : { label: "Rules not saved", icon: <CircleAlert size={12} />, className: "text-danger" };
  return <span aria-live="polite" className={`flex h-4 items-center gap-1.5 text-[11px] ${detail.className}`}>{detail.icon}{detail.label}</span>;
}
