import type { Metadata } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";

import "./globals.css";

import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { getLocale } from "@/lib/i18n";
import { buildLocaleAlternates, localizePath } from "@/lib/locale-path";
import { getSiteUrl } from "@/lib/site";

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

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const rootPath = localizePath("/", locale);

  return {
    metadataBase: getSiteUrl(),
    title: {
      default: "FightBase Media",
      template: "%s | FightBase Media"
    },
    description:
      "FightBase Media covers MMA with daily news, event cards, fighter profiles, rankings, interviews, and analysis across UFC, PFL, and ONE.",
    applicationName: "FightBase Media",
    keywords: [
      "MMA",
      "UFC",
      "PFL",
      "ONE Championship",
      "MMA news",
      "fighter profiles",
      "MMA rankings",
      "MMA events"
    ],
    alternates: buildLocaleAlternates("/"),
    openGraph: {
      type: "website",
      locale: locale === "ru" ? "ru_RU" : "en_US",
      url: rootPath,
      siteName: "FightBase Media",
      title: "FightBase Media",
      description:
        "FightBase Media covers MMA with daily news, event cards, fighter profiles, rankings, interviews, and analysis across UFC, PFL, and ONE."
    },
    twitter: {
      card: "summary_large_image",
      title: "FightBase Media",
      description:
        "FightBase Media covers MMA with daily news, event cards, fighter profiles, rankings, interviews, and analysis across UFC, PFL, and ONE."
    },
    category: "sports"
  };
}

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
