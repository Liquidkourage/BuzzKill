import type { Metadata } from "next";
import { Syne, Figtree, IBM_Plex_Mono, Press_Start_2P, Archivo_Black } from "next/font/google";
import "./globals.css";

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["700", "800"],
});

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const ibm = IBM_Plex_Mono({
  variable: "--font-ibm",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const pressStart = Press_Start_2P({
  variable: "--font-arcade",
  subsets: ["latin"],
  weight: ["400"],
});

const archivoBlack = Archivo_Black({
  variable: "--font-punch",
  subsets: ["latin"],
  weight: ["400"],
});

export const metadata: Metadata = {
  title: "BuzzKill",
  description: "A live team trivia league. Buzzers, steals, and the occasional ego check.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${syne.variable} ${figtree.variable} ${ibm.variable} ${pressStart.variable} ${archivoBlack.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
