"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import PlayingCardMarks from "@/components/PlayingCardMarks";
import styles from "@/components/PlayingCard.module.css";
import type { TableListing } from "@/lib/types";

const POLL_MS = 5000;

/** The diamonds card: public tables in play or filling up, each one a click from the rail. */
export default function BrowseTables() {
  const [tables, setTables] = useState<TableListing[] | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ctrl = new AbortController();
    const tick = async () => {
      // A background tab keeps its timer but stops fetching; the list refreshes on the next tick once it is visible.
      if (!document.hidden) {
        try {
          const res = await fetch("/api/tables", { signal: ctrl.signal, cache: "no-store" });
          const data = (await res.json()) as { tables?: TableListing[] };
          setTables(Array.isArray(data.tables) ? data.tables : []);
        } catch {
          if (!ctrl.signal.aborted) setTables((prev) => prev ?? []);
        }
      }
      if (!ctrl.signal.aborted) timer = setTimeout(() => void tick(), POLL_MS);
    };
    void tick();
    return () => {
      ctrl.abort();
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <section aria-label="Browse the tables" className={`${styles.card} ${styles.red}`}>
      <PlayingCardMarks rank="J" suit="♦" />
      <span className={styles.hint}>Spectate public tables.</span>
      <div className={styles.list}>
        {tables === null ? (
          <p className={styles.empty}>Looking around the room…</p>
        ) : tables.length === 0 ? (
          <p className={styles.empty}>No public tables.</p>
        ) : (
          <ul>
            {tables.map((t) => (
              <li key={t.code} className={styles.row}>
                <span className={styles.rowCode}>{t.code}</span>
                <span className={styles.rowMeta}>
                  {seats(t)} · {t.phase === "playing" ? `Hand ${t.handNumber}${t.handsPerMatch > 0 ? ` of ${t.handsPerMatch}` : ""}` : "Waiting to start"}
                </span>
                <Link href={`/rail/${t.code}`} className={styles.rowAction}>Watch</Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function seats(t: TableListing): string {
  const parts: string[] = [];
  if (t.humans.length) parts.push(t.humans.length === 1 ? t.humans[0] : `${t.humans.length} humans`);
  if (t.ais.length) parts.push(`${t.ais.length} AI${t.ais.length === 1 ? "" : "s"}`);
  return parts.join(" · ") || "Empty";
}
