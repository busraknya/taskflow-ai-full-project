import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { connection } from "next/server";
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
  title: "TaskFlow AI",
  description: "AI-Powered Project Management SaaS",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The nonce-based CSP (src/proxy.ts) requires request-time rendering:
  // static pages are generated without a request, so no nonce could be set.
  await connection();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#09090b] text-zinc-100 font-sans">{children}</body>
    </html>
  );
}