"use client";

/**
 * The felt's action area: an option wheel with one entry per suit, and the card for whichever suit is selected.
 * Spades hosts, hearts joins, clubs watches by code, diamonds browses the tables in play.
 */

import { ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import CodeEntry from "@/components/CodeEntry";
import PlayingCardMarks from "@/components/PlayingCardMarks";
import cardStyles from "@/components/PlayingCard.module.css";
import BrowseTables from "./BrowseTables";
import OptionWheel from "./OptionWheel";
import styles from "./LandingActions.module.css";

const OPTIONS = ["♠ Create a table", "♥ Join a table", "♣ Watch from the rail", "♦ Browse the tables"];

const COMPACT_QUERY = "(max-width: 899px)";
const subscribeCompact = (onChange: () => void) => {
  const mq = window.matchMedia(COMPACT_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};
/** Below the two-column breakpoint the wheel sits above the card, so its labels shrink to fit four rows. Server and first client render agree on the desktop size. */
const useCompact = () => useSyncExternalStore(subscribeCompact, () => window.matchMedia(COMPACT_QUERY).matches, () => false);

export default function LandingActions() {
  const [selected, setSelected] = useState(0);
  const compact = useCompact();
  return (
    <div className={styles.actions}>
      <div className={styles.wheelRow}>
        <div className={styles.steppers}>
          <button type="button" aria-label="Previous option" onClick={() => setSelected((s) => (s + OPTIONS.length - 1) % OPTIONS.length)} className={styles.stepper}><ChevronUp size={20} /></button>
          <button type="button" aria-label="Next option" onClick={() => setSelected((s) => (s + 1) % OPTIONS.length)} className={styles.stepper}><ChevronDown size={20} /></button>
        </div>
        <div className={styles.wheelFrame}>
          <div className={styles.wheel}>
            <OptionWheel
              items={OPTIONS}
              defaultSelected={0}
              selected={selected}
              onChange={(index) => setSelected(index)}
              textColor="#b3b5aa"
              activeColor="#f5e9c3"
              side="left"
              fontSize={compact ? 1.7 : 2.6}
              spacing={2}
              curve={1}
              tilt={15}
              blur={0.5}
              fade={0.25}
              minOpacity={0.2}
              smoothing={180}
              inset={compact ? 40 : 72}
              loop
              scrollable={false}
              soundUrl="/sounds/tick.mp3"
              soundVolume={0.35}
              aria-label="What do you want to do?"
            />
          </div>
        </div>
      </div>
      <div key={selected} className={styles.cardSlot}>
        {selected === 0 && (
          <Link href="/table/new" className={cardStyles.card}>
            <PlayingCardMarks rank="A" suit="♠" />
            <span className={cardStyles.hint}>Set the blinds, write the guest list, and decide who gets to see the tells.</span>
          </Link>
        )}
        {selected === 1 && <CodeEntry title="Join a table" hint="Take a seat at the table with the 4-letter code." mode="join" label="Sit down" rank="K" suit="♥" />}
        {selected === 2 && <CodeEntry title="Watch from the rail" hint="See every card and every tell while on the sidelines." mode="watch" label="Watch" rank="Q" suit="♣" />}
        {selected === 3 && <BrowseTables />}
      </div>
    </div>
  );
}
