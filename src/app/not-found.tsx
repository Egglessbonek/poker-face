import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-xs text-gold">Poker Face</p>
      <h1 className="text-2xl font-semibold">Nothing at this table.</h1>
      <p className="text-sm text-muted">Check the code, or head back to the lobby.</p>
      <Link href="/" className="rounded-full bg-gold px-6 py-2 font-medium text-background">Back to the lobby</Link>
    </main>
  );
}
