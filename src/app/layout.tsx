import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { LanguageProvider } from "@/lib/i18n/context";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
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
  title: "NetGuard — Digital Footprint & Social Media Safety",
  description:
    "NetGuard helps you understand your digital footprint and stay safe on social media with quizzes, link checking, and articles.",
  // No `icons` metadata on purpose. There is exactly one logo - public/logo.png,
  // a teal shield with a transparent background and the keyhole/speed lines cut
  // out of it - so it reads correctly on light and dark browser tabs without a
  // dark-mode variant. `npm run icons` (scripts/generate-icons.cjs) regenerates
  // src/app/favicon.ico, src/app/icon.png and src/app/apple-icon.png from it,
  // and the Next.js App Router file conventions link them automatically.
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-white font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
        <LanguageProvider>
          <Navbar />
          <div className="flex flex-1 flex-col">{children}</div>
          <Footer />
        </LanguageProvider>
      </body>
    </html>
  );
}
