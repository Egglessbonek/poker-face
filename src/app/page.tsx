import Link from "next/link";
import CodeEntry from "@/components/CodeEntry";
import HallOfPokerFaces from "@/components/landing/HallOfPokerFaces";
import LandingBackdrop from "@/components/LandingBackdrop";
import PlayingCardMarks from "@/components/PlayingCardMarks";
import cardStyles from "@/components/PlayingCard.module.css";
import styles from "./landing.module.css";

export default function Landing() {
  return (
    <main className={`${styles.landing} mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center gap-10 px-6 py-12 sm:px-10 lg:py-16`}>
      <div className={styles.hero}>
        <div className={`${styles.copy} flex flex-col items-start gap-4`}>
          <p className="text-sm uppercase tracking-[0.3em] text-gold">Poker Face</p>
          <h1 className="max-w-3xl text-5xl leading-tight sm:text-6xl">The only opponents who can see your pulse.</h1>
          <p className="max-w-xl text-lg text-muted">
            Hold&apos;em with friends and whichever AI models you invite: Claude, GPT, DeepSeek, Gemini, Grok and hundreds more, each playing as itself. They read your face, your hesitation, and your cursor. Spectators watch your tells live from the rail.
          </p>
        </div>
        <div className={styles.chipSlot}>
          <LandingBackdrop />
        </div>
      </div>
      <div className={styles.actions}>
        <Link href="/table/new" className={cardStyles.card}>
          <PlayingCardMarks rank="A" suit="♠" />
          <span className={cardStyles.category}>Host</span>
          <span className={cardStyles.title}>Create a table</span>
          <span className={cardStyles.hint}>Set the blinds, write the guest list, and decide who gets to see the tells.</span>
        </Link>
        <CodeEntry title="Join a table" hint="Take a seat with the 4-letter code." hrefPrefix="/table/" label="Sit down" rank="K" suit="♥" />
        <CodeEntry title="Watch from the rail" hint="See every card and every tell." hrefPrefix="/rail/" label="Watch" rank="Q" suit="♣" />
      </div>
      <div className="relative z-10 mx-auto w-full max-w-3xl">
        <HallOfPokerFaces />
      </div>
    </main>
  );
}
