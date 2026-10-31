import type { Metadata, Viewport } from "next";
import { Bebas_Neue, Geist, Geist_Mono, Oswald, Playfair_Display, Space_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Sticker text fonts: not preloaded, so they only download when someone picks one.
const bebas = Bebas_Neue({ variable: "--font-bebas", weight: "400", subsets: ["latin"], preload: false });
const oswald = Oswald({ variable: "--font-oswald", subsets: ["latin"], preload: false });
const spaceMono = Space_Mono({ variable: "--font-space-mono", weight: ["400", "700"], subsets: ["latin"], preload: false });
const playfair = Playfair_Display({ variable: "--font-playfair", subsets: ["latin"], preload: false });

export const metadata: Metadata = {
  title: "Paceframe",
  description: "Turn your runs into Instagram stories & posts: photo + Strava stickers, arranged your way.",
  appleWebApp: { capable: true, title: "Paceframe", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0c",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${bebas.variable} ${oswald.variable} ${spaceMono.variable} ${playfair.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
