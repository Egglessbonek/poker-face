import Link from "next/link";

export default function Landing() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <p className="text-sm uppercase tracking-[0.3em] text-gold">Poker Face</p>
      <h1 className="max-w-3xl text-5xl font-semibold leading-tight sm:text-6xl">
        The only opponent who can see your pulse.
      </h1>
      <p className="max-w-xl text-lg text-muted">
        Heads-up Hold&apos;em against an AI villain that reads your face, your hesitation, and your cursor. Then it shows you exactly what you gave away.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-4">
        <Link href="/play" className="rounded-full bg-gold px-8 py-3 font-medium text-background">
          Sit down
        </Link>
        <Link href="/rail" className="rounded-full border border-felt-edge px-8 py-3 font-medium">
          Watch from the rail
        </Link>
      </div>
    </main>
  );
}
