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
      <div className={styles.list} role="region" aria-label="Public tables" tabIndex={0}>
        {tables === null ? (
          <p className={styles.empty}>Loading tables…</p>
        ) : tables.length === 0 ? (
          <p className={styles.empty}>No public tables.</p>
        ) : (
          <ul>
            {tables.map((t) => (
              <li key={t.code} className={styles.row}>
                <span className={styles.rowCode}>{t.code}</span>
                <Link href={`/rail/${t.code}`} className={styles.rowAction} aria-label={`Watch table ${t.code}`}>watch <span aria-hidden="true">→</span></Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
