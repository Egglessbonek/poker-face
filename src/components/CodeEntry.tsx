"use client";

import Link from "next/link";
import { useCodeEntry, type CodeEntryMode } from "@/hooks/useCodeEntry";
import PlayingCardMarks from "./PlayingCardMarks";
import styles from "./PlayingCard.module.css";

export default function CodeEntry({
  title,
  mode,
  rank,
  suit,
}: {
  title: string;
  mode: CodeEntryMode;
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
      <div className={styles.entry}>
        <input
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={4}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-invalid={!!error}
          placeholder="table code"
          aria-label="Table code"
        />
        <button disabled={!valid || checking}>
          {checking ? "checking…" : mode} <span aria-hidden="true">→</span>
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
