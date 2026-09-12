"use client";

/**
 * A table-code field that checks the code with the server and only navigates when the table exists.
 * Wrong codes stay on the page with a message instead of landing on a 404.
 */

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { lookupTable } from "@/lib/client/lookup";
import { isValidCode, normalizeCode } from "@/lib/rail/code";

export type CodeEntryMode = "join" | "watch";

export function useCodeEntry(mode: CodeEntryMode) {
  const router = useRouter();
  const [code, setCodeState] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealHref, setRevealHref] = useState<string | null>(null);
  const valid = isValidCode(code);

  const setCode = useCallback((raw: string) => {
    setCodeState(normalizeCode(raw));
    setError(null);
    setRevealHref(null);
  }, []);

  const submit = useCallback(
    async (e?: { preventDefault: () => void }) => {
      e?.preventDefault();
      setError(null);
      setRevealHref(null);
      if (!valid) {
        setError("Codes are four letters, like KXTR.");
        return;
      }
      setChecking(true);
      const found = await lookupTable(code);
      setChecking(false);
      if (found.status === "missing") {
        setError("No table with that code. Check it with the host.");
        return;
      }
      if (found.status === "error") {
        setError("Couldn't reach the table right now. Try again in a moment.");
        return;
      }
      if (mode === "join" && found.phase === "finished") {
        setError("That match is over.");
        setRevealHref(`/reveal/${code}`);
        return;
      }
      router.push(`${mode === "join" ? "/table/" : "/rail/"}${code}`);
    },
    [code, valid, mode, router],
  );

  return { code, setCode, valid, checking, error, revealHref, submit };
}
