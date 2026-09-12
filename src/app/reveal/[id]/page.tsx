import { notFound } from "next/navigation";
import { getSession } from "@/lib/store";
import RevealView from "@/components/reveal/RevealView";

export const dynamic = "force-dynamic";

export default async function RevealPage(props: PageProps<"/reveal/[id]">) {
  const { id } = await props.params;
  const session = getSession(id);
  if (!session) notFound();
  return <RevealView session={session} />;
}
