"use client";

import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Bot, CameraOff, CheckCircle2, CircleAlert, CircleDashed, Copy, Crown, Globe2, LoaderCircle, Lock, LogOut, QrCode, Trash2, X } from "lucide-react";
import ModelPicker from "@/components/table/ModelPicker";
import TableSettingsEditor from "@/components/table/TableSettingsEditor";
import { TIERS, describeModelId } from "@/lib/llm/models";
import type { LobbyCameraStatus, Player, TableConfig, TableState } from "@/lib/types";

interface Props {
  state: TableState;
  playerId: string;
  error?: string | null;
  cameraStatuses: Record<string, LobbyCameraStatus>;
  readyPlayers: Record<string, boolean>;
  onReadyChange: (ready: boolean) => void | Promise<unknown>;
  onAddAI: (modelId: string) => void | Promise<unknown>;
  onRemove: (playerId: string) => void | Promise<unknown>;
  onUpdateConfig: (config: Partial<TableConfig>) => Promise<unknown>;
  onUpdateVisibility: (isPublic: boolean) => Promise<unknown>;
  onStart: () => void;
  onLeave: () => void;
  cameraPanel: React.ReactNode;
}

export default function TableLobby({ state, playerId, error, cameraStatuses, readyPlayers, onReadyChange, onAddAI, onRemove, onUpdateConfig, onUpdateVisibility, onStart, onLeave, cameraPanel }: Props) {
  const isHost = state.hostId === playerId;
  const minimumSeats = Math.max(2, state.players.length);
  const openSeats = state.config.maxSeats - state.players.length;
  const aiPlayers = state.players.filter((player) => player.kind === "ai");
  const humanPlayers = state.players.filter((player) => player.kind === "human");
  const playersBySeat = new Map(state.players.map((player) => [player.seat, player]));
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
  const persistChange = async (operation: () => Promise<unknown>) => {
    const revision = ++saveRevision.current;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    setSaveStatus("saving");
    try {
      await operation();
      if (revision !== saveRevision.current) return;
      setSaveStatus("saved");
      saveTimer.current = window.setTimeout(() => setSaveStatus("idle"), 2200);
    } catch {
      if (revision === saveRevision.current) setSaveStatus("error");
    }
  };
  const updateConfig = (config: Partial<TableConfig>) => persistChange(() => onUpdateConfig(config));
  const updateVisibility = () => persistChange(() => onUpdateVisibility(!state.isPublic));
  const requestStart = () => {
    if (unfinishedCamera.length || unreadyPlayers.length) setShowStartWarning(true);
    else onStart();
  };

  return (
    <>
      <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-5 px-4 py-8 sm:px-8">
        <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <h1 className="mt-2 text-4xl font-semibold">Table <span className="font-mono text-gold">{state.code}</span></h1>
          </div>
          <div className="flex w-full flex-col items-stretch gap-2 lg:w-[30rem] lg:items-end">
            <div className="grid h-10 w-full grid-cols-3 gap-2">
              <button type="button" disabled={!isHost} aria-pressed={state.isPublic} aria-label={state.isPublic ? "Public table; make private" : "Private table; make public"} title={isHost ? (state.isPublic ? "Hide this table from Browse the tables" : "List this table in Browse the tables") : "Only the host can change table visibility"} onClick={() => void updateVisibility()} className={`flex h-10 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-full border px-2 text-sm transition disabled:cursor-default sm:px-3 ${state.isPublic ? "border-ok/50 text-ok" : "border-felt-edge text-muted"}`}>{state.isPublic ? <Globe2 size={15} /> : <Lock size={15} />} {state.isPublic ? "Public" : "Private"}</button>
              <button type="button" onClick={() => setShowQR(true)} className="flex h-10 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-felt-edge px-2 text-sm transition hover:border-gold sm:px-3"><QrCode size={15} /> QR code</button>
              <button type="button" onClick={copyInvite} className={`flex h-10 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-full border px-2 text-sm transition sm:px-3 ${copied ? "border-ok text-ok" : "border-felt-edge hover:border-gold"}`}><Copy size={15} /> {copied ? "Copied" : "Copy"}</button>
            </div>
            {isHost && <SaveIndicator status={saveStatus} />}
          </div>
        </header>

        {error && <p role="alert" className="rounded-xl bg-danger/15 px-4 py-3 text-sm text-danger">{error}</p>}

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col gap-5">
          <section className="rounded-3xl border border-felt-edge bg-felt/20 p-5 sm:p-7" aria-labelledby="capacity-title">
            <div className="flex items-end justify-between gap-4">
              <div><h2 id="capacity-title" className="mt-1 text-2xl">{state.config.maxSeats} seats</h2></div>
              <p className="text-right text-xs text-muted">{state.players.length} seated · {openSeats} open</p>
            </div>
            {isHost ? (
              <div className="mt-5">
                <input type="range" aria-label="Maximum number of seats" min={minimumSeats} max={9} step={1} defaultValue={state.config.maxSeats} onChange={(event) => void updateConfig({ maxSeats: Number(event.target.value) })} className="w-full accent-gold" />
              </div>
            ) : <p className="mt-4 text-xs text-muted">Only the host can change the table capacity.</p>}
          </section>

          <section className="rounded-3xl border border-felt-edge bg-felt/20 p-4 sm:p-6">
            <div className="rounded-[2.25rem] bg-[#3a281d] p-2 shadow-[0_12px_28px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.08)] sm:p-2.5">
              <div className="relative overflow-hidden rounded-[1.8rem] border border-gold/20 bg-felt px-3 py-4 shadow-[inset_0_0_34px_rgba(0,0,0,0.34)] sm:px-4">
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.07]"><span className="font-mono text-3xl text-card sm:text-5xl">{state.code}</span></div>
                <div className="relative grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: state.config.maxSeats }, (_, seat) => {
                    const player = playersBySeat.get(seat);
                    return player
                      ? <LobbySeat key={player.id} player={player} viewerId={playerId} hostId={state.hostId} isHost={isHost} busy={rosterBusy} cameraStatus={cameraStatuses[player.id] ?? "not_started"} ready={!!readyPlayers[player.id]} onRemove={() => void updateRoster(() => onRemove(player.id))} />
                      : <OpenSeat key={seat} seat={seat} />;
                  })}
                </div>
              </div>
            </div>

            {isHost && openSeats > 0 && (
              <div className="mt-5 border-t border-felt-edge/60 pt-5">
                {aiPlayers.length === 0 && (
                  <div className="mb-5">
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
              <button type="button" aria-pressed={ownReady} onClick={() => void onReadyChange(!ownReady)} className={`flex items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm transition ${ownReady ? "border-ok bg-ok/10 text-ok" : "border-felt-edge hover:border-gold"}`}><CheckCircle2 size={15} /> {ownReady ? "Ready" : "I’m ready"}</button>
            </div>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
              <button type="button" onClick={onLeave} className="flex items-center justify-center gap-2 px-4 py-2 text-xs text-muted hover:text-foreground"><LogOut size={13} /> Leave table</button>
              {isHost ? <div className="text-center"><p className="mb-1 text-[10px] text-muted">{humanPlayers.length - unreadyPlayers.length}/{humanPlayers.length} humans ready</p><button type="button" onClick={requestStart} disabled={state.players.length < 2 || rosterBusy} className="rounded-full bg-gold px-8 py-3 font-semibold text-background disabled:opacity-40">Deal the first hand</button></div> : <p className="rounded-2xl border border-felt-edge px-5 py-3 text-center text-xs text-muted">The host will deal when everyone is ready.</p>}
            </div>
          </footer>
          </div>
        <aside aria-label="Camera and measurements" className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto">{cameraPanel}</aside>
        </div>
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
            <p className="text-xs text-gold">Scan to join</p>
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

function LobbySeat({ player, viewerId, hostId, isHost, busy, cameraStatus, ready, onRemove }: { player: Player; viewerId: string; hostId: string; isHost: boolean; busy: boolean; cameraStatus: LobbyCameraStatus; ready: boolean; onRemove: () => void }) {
  const model = player.modelId ? describeModelId(player.modelId) : null;
  const description = model ? `${model.vendor} · ${player.modelId}` : player.connected ? "Human · connected" : "Human · reconnecting";
  const seatAccent = player.kind === "ai" ? "border-chip-blue/35" : !player.connected ? "border-danger/35" : ready ? "border-ok/35" : "border-white/10";
  return (
    <div className={`flex min-h-[4.5rem] items-center gap-2 rounded-xl border bg-background/75 p-2.5 shadow-md shadow-black/20 backdrop-blur-sm sm:min-h-[5.5rem] ${seatAccent}`}>
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 text-xs font-semibold ${player.kind === "ai" ? "bg-chip-blue/70" : "bg-felt-edge"}`}>{player.kind === "ai" ? <Bot size={16} /> : player.name.slice(0, 1).toUpperCase()}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] text-gold/75">Seat {player.seat + 1}</p>
        <p className="flex items-center gap-1 truncate text-xs font-medium"><span className="truncate">{player.name}</span>{player.id === viewerId && <span className="shrink-0 text-[10px] text-muted">(you)</span>}{player.id === hostId && <Crown size={11} className="shrink-0 text-gold" />}</p>
        <p title={description} className="truncate text-[10px] text-muted">{description}</p>
        {player.kind === "human" && <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5"><CameraBadge status={cameraStatus} /><ReadyBadge ready={ready} /></div>}
      </div>
      {isHost && player.id !== hostId && <button type="button" disabled={busy} aria-label={`Remove ${player.name}`} onClick={onRemove} className="shrink-0 rounded-lg p-1.5 text-muted transition hover:bg-danger/10 hover:text-danger disabled:opacity-40"><Trash2 size={13} /></button>}
    </div>
  );
}

function OpenSeat({ seat }: { seat: number }) {
  return <div className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-dashed border-card/20 bg-black/10 text-card/45 sm:min-h-[5.5rem]"><CircleDashed size={14} /><span className="text-[10px]">Seat {seat + 1} · open</span></div>;
}

function CameraBadge({ status }: { status: LobbyCameraStatus }) {
  const detail = cameraDetails[status];
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] ${detail.className}`}>{detail.icon}{detail.label}</span>;
}

function ReadyBadge({ ready }: { ready: boolean }) {
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] ${ready ? "text-ok" : "text-muted"}`}>{ready ? <CheckCircle2 size={13} /> : <CircleDashed size={13} />}{ready ? "Ready" : "Not ready"}</span>;
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
