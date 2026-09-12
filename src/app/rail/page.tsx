import RailJoin from "@/components/rail/RailJoin";

export default function RailPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16">
      <h1 className="text-3xl font-semibold">Join the rail</h1>
      <p className="text-muted">Enter the 4-digit code shown on the player&apos;s table.</p>
      <RailJoin />
    </main>
  );
}
