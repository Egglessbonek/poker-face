"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { isValidCode, normalizeCode } from "@/lib/rail/code";
import PlayingCardMarks from "./PlayingCardMarks";
import styles from "./PlayingCard.module.css";

export default function CodeEntry({ title, hint, hrefPrefix, label, rank, suit }: { title: string; hint: string; hrefPrefix: string; label: string; rank: string; suit: string }) {
  const [code, setCode] = useState("");
  const router = useRouter();
  const valid = isValidCode(code);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) router.push(`${hrefPrefix}${code}`);
      }}
      aria-label={title}
      className={`${styles.card} ${suit === "♥" || suit === "♦" ? styles.red : ""}`}
    >
      <PlayingCardMarks rank={rank} suit={suit} />
      <span className={styles.category}>Code</span>
      <span className={styles.title}>{title}</span>
      <span className={styles.hint}>{hint}</span>
      <div className={styles.entry}>
        <input
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={4}
          value={code}
          onChange={(e) => setCode(normalizeCode(e.target.value))}
          placeholder="KXTR"
          aria-label="Table code"
        />
        <button disabled={!valid}>{label}</button>
      </div>
    </form>
  );
}
