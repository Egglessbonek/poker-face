import { Bot, MessageCircle, Spade, Trophy } from "lucide-react";
import type { RailHistoryEntry } from "./model";

const ICON = {
  action: Spade,
  deal: Spade,
  talk: MessageCircle,
  result: Trophy,
};

export default function RailHistory({ entries, embedded = false }: { entries: RailHistoryEntry[]; embedded?: boolean }) {
  return (
    <section className={`${embedded ? "flex h-full min-h-0 flex-col" : "rounded-2xl border border-white/10 bg-white/[0.025]"}`}>
      <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Hand history</h2>
        <span className="text-xs text-white/35">Hand {entries.at(-1)?.handNumber ?? "—"}</span>
      </div>
      <ol className={`${embedded ? "min-h-0 flex-1" : "max-h-64"} overflow-y-auto px-4 py-2`}>
        {[...entries].reverse().map((entry, index) => {
          const Icon = ICON[entry.tone];
          const isAi = entry.isAi ?? false;
          return (
            <li key={entry.id} className={`flex gap-2.5 border-b border-white/5 py-2.5 last:border-0 ${index === 0 ? "text-white" : "text-white/50"}`}>
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/5">
                {isAi ? <Bot size={11} className="text-gold" /> : <Icon size={11} />}
              </span>
              <div>
                <p className="text-xs leading-relaxed">{entry.message}</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-wider text-white/25">{entry.street}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
