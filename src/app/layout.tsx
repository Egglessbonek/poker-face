import type { Metadata } from "next";
import { Newsreader, Pliant } from "next/font/google";
import "./globals.css";

const pliant = Pliant({ variable: "--font-pliant", subsets: ["latin"], display: "swap" });
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Poker Face",
  description: "Heads-up poker against an AI that reads your face.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${pliant.variable} ${newsreader.variable} h-full antialiased dark`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">{children}</body>
    </html>
  );
}
