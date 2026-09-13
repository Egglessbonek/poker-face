"use client";

import { useCallback, useEffect, useState } from "react";
import type { LobbyCameraStatus } from "@/lib/types";

interface StatusResponse {
  statuses: Record<string, LobbyCameraStatus>;
  ready: Record<string, boolean>;
}

/** Small, isolated lobby-presence channel. Camera imagery and measurements remain client-side. */
export function useLobbyCameraStatus(code: string, token: string, playerId: string, ownStatus: LobbyCameraStatus, active: boolean) {
  const [statuses, setStatuses] = useState<Record<string, LobbyCameraStatus>>({});
  const [readyPlayers, setReadyPlayers] = useState<Record<string, boolean>>({});

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/table/${code}/camera?token=${encodeURIComponent(token)}`, { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json() as StatusResponse;
    setStatuses(data.statuses);
    setReadyPlayers(data.ready);
  }, [code, token]);

  useEffect(() => {
    if (!active) return;
    const initial = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 1500);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [active, refresh]);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    void fetch(`/api/table/${code}/camera`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, status: ownStatus }),
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) return;
      const data = await response.json() as StatusResponse;
      setStatuses(data.statuses);
      setReadyPlayers(data.ready);
    }).catch(() => {});
    return () => controller.abort();
  }, [active, code, ownStatus, token]);

  const setReady = useCallback(async (ready: boolean) => {
    setReadyPlayers((current) => ({ ...current, [playerId]: ready }));
    try {
      const response = await fetch(`/api/table/${code}/camera`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ready }),
      });
      if (!response.ok) throw new Error("Could not update ready status");
      const data = await response.json() as StatusResponse;
      setStatuses(data.statuses);
      setReadyPlayers(data.ready);
    } catch {
      setReadyPlayers((current) => ({ ...current, [playerId]: !ready }));
    }
  }, [code, playerId, token]);

  return { cameraStatuses: statuses, readyPlayers, setReady };
}
