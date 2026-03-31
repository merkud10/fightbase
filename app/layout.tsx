import type { Metadata } from "next";
import { Inter, Oswald, Russo_One } from "next/font/google";

import "./globals.css";

import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { ScrollToTop } from "@/components/header-shell";
import { getLocale } from "@/lib/i18n";
import { buildLocaleAlternates, localizePath } from "@/lib/locale-path";
import { getSiteUrl } from "@/lib/site";

const bodyFont = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700", "800"]
});

const headingFont = Oswald({
  subsets: ["latin", "cyrillic"],
  variable: "--font-heading",
  weight: ["300", "400", "500"]
});

const navFont = Russo_One({
  subsets: ["latin", "cyrillic"],
  variable: "--font-nav",
  weight: ["400"]
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
      "FightBase Media covers MMA with daily news, event cards, fighter profiles, rankings, interviews, and matchup predictions across UFC, PFL, and ONE.",
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
        "FightBase Media covers MMA with daily news, event cards, fighter profiles, rankings, interviews, and matchup predictions across UFC, PFL, and ONE."
    },
    twitter: {
      card: "summary_large_image",
      title: "FightBase Media",
      description:
        "FightBase Media covers MMA with daily news, event cards, fighter profiles, rankings, interviews, and matchup predictions across UFC, PFL, and ONE."
    },
    category: "sports"
  };
}

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();

  return (
    <html lang={locale}>
      <body className={`${bodyFont.variable} ${headingFont.variable} ${navFont.variable}`}>
        <div className="page-shell">
          <Header />
          {children}
          <Footer />
        </div>
        <ScrollToTop />
      </body>
    </html>
  );
}
