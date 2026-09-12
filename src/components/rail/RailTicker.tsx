import type { RailHistoryEntry } from "./model";

export function tickerMessage(entry: Pick<RailHistoryEntry, "message" | "playerName">): string {
  if (!entry.playerName) return entry.message;
  const prefix = `${entry.playerName} `;
  return entry.message.startsWith(prefix) ? entry.message.slice(prefix.length) : entry.message;
}

export default function RailTicker({ entries }: { entries: RailHistoryEntry[] }) {
  return (
    <footer className="flex min-h-11 items-center gap-3 overflow-hidden border-t border-white/8 bg-[#0c1310] px-3 text-xs" aria-label="Recent table action" aria-live="polite">
      <span className="shrink-0 font-semibold uppercase tracking-[0.15em] text-gold">Live action</span>
      <div className="flex min-w-0 items-center overflow-hidden">
        {entries.slice(-4).reverse().map((entry) => {
          const message = tickerMessage(entry);
          return (
            <span key={entry.id} className="shrink-0 border-l border-white/10 px-3 text-white/45 first:border-l-0">
              {entry.playerName && <strong className="font-semibold text-white/80">{entry.playerName} </strong>}{message}
            </span>
          );
        })}
      </div>
    </footer>
  );
}
