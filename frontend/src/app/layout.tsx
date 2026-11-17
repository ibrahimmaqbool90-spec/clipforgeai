import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PeakSlicer AI ? Turn Raw MP4 Videos Into Viral Shorts & Reels",
  description:
    "Upload any MP4 gameplay, stream, or podcast video. PeakSlicer AI detects audio & scene peaks, stitches full story arcs, and burns dynamic 9:16 captions automatically.",
  keywords: [
    "PeakSlicer AI",
    "MP4 to YouTube Shorts",
    "AI video clipper",
    "Instagram Reels generator",
    "auto captions vertical video",
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
