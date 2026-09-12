import { prettyCard, suitOf } from "@/lib/poker/cards";
import type { Card as CardCode } from "@/lib/types";
import { cn } from "@/lib/utils";

export function PlayingCard({ card, size = "md" }: { card?: CardCode; size?: "sm" | "md" | "lg" }) {
  const dims = { sm: "h-12 w-8 text-sm", md: "h-20 w-14 text-xl", lg: "h-28 w-20 text-3xl" }[size];
  if (!card) {
    return <div className={cn(dims, "rounded-lg border border-felt-edge bg-chip-blue/80 bg-[repeating-linear-gradient(45deg,transparent_0_6px,rgba(255,255,255,0.08)_6px_8px)]")} />;
  }
  const red = suitOf(card) === "h" || suitOf(card) === "d";
  return (
    <div className={cn(dims, "flex items-center justify-center rounded-lg bg-card font-semibold shadow", red ? "text-chip-red" : "text-background")}>
      {prettyCard(card)}
    </div>
  );
}
