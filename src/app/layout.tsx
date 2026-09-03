import type { Metadata } from "next";
import { Fraunces, Karla, Space_Mono } from "next/font/google";
import "./globals.css";

const display = Fraunces({ subsets: ["latin"], variable: "--font-display" });
const body = Karla({ subsets: ["latin"], variable: "--font-body" });
const mono = Space_Mono({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "The Muscle-Up Project",
  description: "Strength actuals, trending to bodyweight.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
