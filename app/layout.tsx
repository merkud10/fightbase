import type { Metadata } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";

import "./globals.css";

import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { getLocale } from "@/lib/i18n";

const bodyFont = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700", "800"]
});

const displayFont = Cormorant_Garamond({
  subsets: ["latin", "cyrillic"],
  variable: "--font-display",
  weight: ["500", "600", "700"]
});

export const metadata: Metadata = {
  title: {
    default: "FightBase Media",
    template: "%s | FightBase Media"
  },
  description:
    "MMA media platform with news, events, fighter profiles, rankings, analysis, quotes, and AI-assisted publishing workflows."
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();

  return (
    <html lang={locale}>
      <body className={`${bodyFont.variable} ${displayFont.variable}`}>
        <div className="page-shell">
          <Header />
          {children}
          <Footer />
        </div>
      </body>
    </html>
  );
}
