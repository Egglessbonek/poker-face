"use client";

import Link from "next/link";
import { useCodeEntry, type CodeEntryMode } from "@/hooks/useCodeEntry";
import PlayingCardMarks from "./PlayingCardMarks";
import styles from "./PlayingCard.module.css";

export default function CodeEntry({
  title,
  hint,
  mode,
  label,
  rank,
  suit,
}: {
  title: string;
  hint: string;
  mode: CodeEntryMode;
  label: string;
  rank: string;
  suit: string;
}) {
  const { code, setCode, valid, checking, error, revealHref, submit } =
    useCodeEntry(mode);
  return (
    <form
      onSubmit={submit}
      aria-label={title}
      className={`${styles.card} ${suit === "♥" || suit === "♦" ? styles.red : ""}`}
    >
      <PlayingCardMarks rank={rank} suit={suit} />
      <span className={styles.hint}>{hint}</span>
      <div className={styles.entry}>
        <input
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={4}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-invalid={!!error}
          placeholder="HKRC"
          aria-label="Table code"
        />
        <button disabled={!valid || checking}>
          {checking ? "Checking…" : label}
        </button>
      </div>
      {error && (
        <span role="alert" className="mt-2 block text-xs text-danger">
          {error}
          {revealHref && (
            <>
              {" "}
              <Link href={revealHref} className="underline">
                See the reveal
              </Link>
            </>
          )}
        </span>
      )}
    </form>
  );
}
