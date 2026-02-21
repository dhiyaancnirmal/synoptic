import type { Metadata } from "next";
import localFont from "next/font/local";
import { Geist_Mono, Manrope } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

const manrope = Manrope({ subsets: ["latin"] });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const m290 = localFont({
  src: "../public/fonts/M290.ttf",
  variable: "--font-m290",
  display: "swap"
});

export const metadata: Metadata = {
  title: "Synoptic",
  description: "Agent command center for x402 payments, trading + LP execution, and on-chain visibility"
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${manrope.className} ${geistMono.variable} ${m290.variable}`}>{children}</body>
    </html>
  );
}
