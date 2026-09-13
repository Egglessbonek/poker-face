import BlurText from "@/components/landing/BlurText";
import HallOfPokerFaces from "@/components/landing/HallOfPokerFaces";
import LandingActions from "@/components/landing/LandingActions";
import LandingPokerTable from "@/components/landing/LandingPokerTable";
import LandingBackdrop from "@/components/LandingBackdrop";
import styles from "./landing.module.css";

export default function Landing() {
  return (
    <main className={`${styles.landing} mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center gap-10 px-3 py-12 sm:px-10 lg:py-16`}>
      <div className={styles.hero}>
        <div className={`${styles.copy} flex flex-col items-start gap-4`}>
          <BlurText as="h1" text="Poker Face" animateBy="letters" delay={90} stepDuration={0.3} className="font-display text-7xl leading-none tracking-tight text-gold sm:text-8xl lg:text-9xl" />
          <p className="max-w-3xl font-display text-3xl leading-tight sm:text-4xl">The only opponents who can read your face.</p>
          <p className="max-w-xl text-lg text-muted">
            Play Texas Hold &apos;Em with friends and AI models. They read your face and your hesitation. Spectators watch your tells live from the rail.
          </p>
          <p className="text-sm text-muted/80">Every AI seat speaks its table talk aloud through ElevenLabs.</p>
        </div>
        <div className={styles.chipSlot}>
          <LandingBackdrop />
        </div>
      </div>
      <LandingPokerTable>
        <LandingActions />
        <div className="mx-auto w-full max-w-3xl">
          <HallOfPokerFaces />
        </div>
      </LandingPokerTable>
    </main>
  );
}
