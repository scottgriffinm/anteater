import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AnteaterBarWrapper } from "@/components/anteater-bar-wrapper";
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
  title: "Anteater — Your app rewrites itself",
  description:
    "Describe changes in plain English. Anteater applies them to your live site via GitHub Actions and Vercel.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <body className="min-h-screen flex flex-col">
          {children}
          <AnteaterBarWrapper />
        </body>
    </html>
  );
}
