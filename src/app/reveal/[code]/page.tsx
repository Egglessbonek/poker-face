import Link from "next/link";
import RevealView, { type HallRanks } from "@/components/reveal/RevealView";
import { buildReveal } from "@/lib/game/reveal";
import { getTableLog } from "@/lib/game/table";
import { hallRank } from "@/lib/hall";

export const dynamic = "force-dynamic";

export default async function RevealPage(props: PageProps<"/reveal/[code]">) {
  const { code } = await props.params;
  const log = getTableLog(code);
  if (!log) {
    // Tables live in server memory: a redeploy or restart takes the log with them.
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-gold">The Reveal · table {code}</p>
        <h1 className="text-2xl font-semibold">That table has left the building.</h1>
        <p className="max-w-md text-sm text-muted">Either the code is wrong, or the server restarted since the match and its record is gone. Match records live only as long as the server does.</p>
        <Link href="/" className="rounded-full bg-gold px-6 py-2 font-medium text-background">Start a new table</Link>
      </main>
    );
  }
  const data = buildReveal(log);
  // Where each human stands in the Hall of Poker Faces. Only humans with a graded face have an entry.
  const ranks: HallRanks = {};
  for (const h of data.humans) {
    const r = hallRank(code, h.player.name);
    if (r) ranks[h.player.id] = r;
  }
  return <RevealView data={data} ranks={ranks} />;
}
