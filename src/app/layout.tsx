import type { Metadata } from "next";
import { Libre_Caslon_Display, Onest } from "next/font/google";
import "./globals.css";

const onest = Onest({ variable: "--font-onest", subsets: ["latin"], display: "swap" });
const caslon = Libre_Caslon_Display({ variable: "--font-libre-caslon", weight: "400", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Poker Face",
  description: "Heads-up poker against an AI that reads your face.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${onest.variable} ${caslon.variable} h-full antialiased dark`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">{children}</body>
    </html>
  );
}
