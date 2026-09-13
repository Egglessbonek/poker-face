"use client";

import { useCallback, useEffect, useState } from "react";
import type { LobbyCameraStatus } from "@/lib/types";

interface StatusResponse {
  statuses: Record<string, LobbyCameraStatus>;
}

/** Small, isolated lobby-presence channel. Camera imagery and measurements remain client-side. */
export function useLobbyCameraStatus(code: string, token: string, ownStatus: LobbyCameraStatus, active: boolean) {
  const [statuses, setStatuses] = useState<Record<string, LobbyCameraStatus>>({});

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/table/${code}/camera?token=${encodeURIComponent(token)}`, { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json() as StatusResponse;
    setStatuses(data.statuses);
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
    }).catch(() => {});
    return () => controller.abort();
  }, [active, code, ownStatus, token]);

  return statuses;
}
