import type { Metadata } from "next";
import { Creepster, Geist } from "next/font/google";
import SpookyScene from "./SpookyScene";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const creepster = Creepster({
  variable: "--font-creepster",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dead Link Séance",
  description:
    "Paste a dead link and summon its past from the Internet Archive Wayback Machine.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geistSans.variable} ${creepster.variable}`}>
      <body>
        <SpookyScene />
        {children}
      </body>
    </html>
  );
}
