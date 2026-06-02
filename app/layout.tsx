import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://beesweeper.vercel.app"),
  title: {
    default: "BeeSweeper",
    template: "%s | BeeSweeper",
  },
  description: "Clear the hive. Avoid the bees. Submit scores on Base.",
  applicationName: "BeeSweeper",
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon.png", type: "image/png" },
      { url: "/farcaster/icon.png", type: "image/png", sizes: "1024x1024" },
    ],
    apple: [{ url: "/apple-icon.png", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "BeeSweeper",
    title: "BeeSweeper",
    description: "Clear the hive. Avoid the bees. Submit scores on Base.",
    images: [
      {
        url: "/farcaster/og.png",
        width: 1200,
        height: 630,
        alt: "BeeSweeper",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "BeeSweeper",
    description: "Clear the hive. Avoid the bees. Submit scores on Base.",
    images: ["/farcaster/og.png"],
  },
  other: {
    "base:app_id": "6a05008173adbbd91cb022f2",
    "fc:miniapp": JSON.stringify({
      version: "1",
      imageUrl: "https://beesweeper.vercel.app/farcaster/embed.png",
      button: {
        title: "Play BeeSweeper",
        action: {
          type: "launch_miniapp",
          name: "BeeSweeper",
          url: "https://beesweeper.vercel.app/mini",
          splashImageUrl: "https://beesweeper.vercel.app/farcaster/splash.png",
          splashBackgroundColor: "#07121F",
        },
      },
    }),
    "fc:frame": JSON.stringify({
      version: "1",
      imageUrl: "https://beesweeper.vercel.app/farcaster/embed.png",
      button: {
        title: "Play BeeSweeper",
        action: {
          type: "launch_miniapp",
          name: "BeeSweeper",
          url: "https://beesweeper.vercel.app/mini",
          splashImageUrl: "https://beesweeper.vercel.app/farcaster/splash.png",
          splashBackgroundColor: "#07121F",
        },
      },
    }),
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full"><Providers>{children}</Providers></body>
    </html>
  );
}
