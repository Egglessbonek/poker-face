import type { ReactNode } from "react";
import styles from "./LandingPokerTable.module.css";

/** A felt table surface for the landing page's cards and leaderboard. */
export default function LandingPokerTable({ children }: { children: ReactNode }) {
  return (
    <section aria-label="Poker table lobby" className={styles.table}>
      <div className={styles.rail}>
        <div className={styles.felt}>
          <div className={styles.suits} aria-hidden="true">♠ <span>♥</span> ♣ <span>♦</span></div>
          <div className={styles.content}>{children}</div>
          <div className={styles.dealer} aria-hidden="true">Dealer</div>
        </div>
      </div>
    </section>
  );
}
