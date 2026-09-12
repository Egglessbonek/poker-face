"use client";

import { useEffect, useRef } from "react";

export default function LandingBackdrop() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let dispose: (() => void) | undefined;

    // Keep three.js off the critical path for the landing copy and forms.
    import("./landing-backdrop/scene")
      .then(({ mountBackdrop }) => {
        if (!cancelled && host.current) dispose = mountBackdrop(host.current);
      })
      .catch(() => {
        // This decoration is optional, including when its chunk cannot load.
      });

    return () => {
      cancelled = true;
      dispose?.();
    };
  }, []);

  return <div ref={host} aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden" />;
}
