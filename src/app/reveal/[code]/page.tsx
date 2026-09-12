import { notFound } from "next/navigation";
import RevealView from "@/components/reveal/RevealView";
import { buildReveal } from "@/lib/game/reveal";
import { getTableLog } from "@/lib/game/table";

export const dynamic = "force-dynamic";

export default async function RevealPage(props: PageProps<"/reveal/[code]">) {
  const { code } = await props.params;
  const log = getTableLog(code);
  if (!log) notFound();
  return <RevealView data={buildReveal(log)} />;
}
