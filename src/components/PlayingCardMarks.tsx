import styles from "./PlayingCard.module.css";

export default function PlayingCardMarks({ rank, suit }: { rank: string; suit: string }) {
  return (
    <span aria-hidden="true" className={styles.marks}>
      <span className={styles.corner}><span>{rank}</span><span>{suit}</span></span>
      <span className={styles.pip}>{suit}</span>
      <span className={`${styles.corner} ${styles.reverse}`}><span>{rank}</span><span>{suit}</span></span>
    </span>
  );
}
