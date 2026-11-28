import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { connection } from "next/server";
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
  title: { default: "TaskFlow AI", template: "%s · TaskFlow AI" },
  description: "Self-hosted task management for teams, with delay-risk prediction trained on your own history.",
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
      <body className="flex min-h-full flex-col bg-canvas font-sans text-fg">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}