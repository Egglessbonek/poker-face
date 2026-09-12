import Link from "next/link";
import CodeEntry from "@/components/CodeEntry";

export default function Landing() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-16 text-center">
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm uppercase tracking-[0.3em] text-gold">Poker Face</p>
        <h1 className="max-w-3xl text-5xl font-semibold leading-tight sm:text-6xl">The only opponents who can see your pulse.</h1>
        <p className="max-w-xl text-lg text-muted">
          Hold&apos;em with friends and whichever AI models you invite: Claude, GPT, DeepSeek, Gemini, Grok and hundreds more, each playing as itself. They read your face, your hesitation, and your cursor. Spectators watch your tells live from the rail.
        </p>
      </div>
      <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-3">
        <Link href="/table/new" className="flex flex-col gap-2 rounded-2xl border border-gold/60 bg-gold/10 p-5 text-left transition hover:bg-gold/20">
          <span className="text-xs uppercase tracking-widest text-gold">Host</span>
          <span className="text-xl font-semibold">Create a table</span>
          <span className="text-sm text-muted">Set the blinds, write the guest list, and decide who gets to see the tells.</span>
        </Link>
        <CodeEntry title="Join a table" hint="Take a seat with the 4-letter code." hrefPrefix="/table/" label="Sit down" />
        <CodeEntry title="Watch from the rail" hint="See every card and every tell." hrefPrefix="/rail/" label="Watch" />
      </div>
    </main>
  );
}
