import type { Metadata } from "next";
import { Inter, Oswald, Russo_One } from "next/font/google";

import "./globals.css";

import { Footer } from "@/components/footer";
import { FloatingSocialLinks } from "@/components/floating-social-links";
import { Header } from "@/components/header";
import { ScrollToTop } from "@/components/header-shell";
import { JsonLd } from "@/components/json-ld";
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
  const isRu = locale === "ru";
  const description = isRu
    ? "FightBase Media - MMA-медиа о UFC: новости, прогнозы, турниры, бойцы, рейтинги и редакционные разборы боев."
    : "FightBase Media is an MMA publication focused on UFC news, fight analysis, event pages, fighter profiles, rankings, and predictions.";

  return {
    metadataBase: getSiteUrl(),
    title: {
      default: "FightBase Media",
      template: "%s | FightBase Media"
    },
    description,
    applicationName: "FightBase Media",
    creator: "FightBase Media",
    publisher: "FightBase Media",
    keywords: [
      "MMA",
      "UFC",
      "MMA news",
      "UFC news",
      "UFC events",
      "UFC predictions",
      "UFC fighters",
      "UFC rankings",
      "новости UFC",
      "прогнозы UFC",
      "бойцы UFC",
      "турниры UFC",
      "рейтинги UFC"
    ],
    robots: {
      index: true,
      follow: true
    },
    verification: {
      google: process.env.GOOGLE_SITE_VERIFICATION,
      yandex: process.env.YANDEX_VERIFICATION
    },
    formatDetection: {
      telephone: false,
      address: false,
      email: false
    },
    alternates: buildLocaleAlternates("/"),
    openGraph: {
      type: "website",
      locale: isRu ? "ru_RU" : "en_US",
      url: rootPath,
      siteName: "FightBase Media",
      title: "FightBase Media",
      description
    },
    twitter: {
      card: "summary_large_image",
      title: "FightBase Media",
      description
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
  const siteUrl = getSiteUrl().toString().replace(/\/$/, "");

  return (
    <html lang={locale}>
      <body className={`${bodyFont.variable} ${headingFont.variable} ${navFont.variable}`}>
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "NewsMediaOrganization",
            name: "FightBase Media",
            url: siteUrl,
            areaServed: ["RU", "US", "Worldwide"],
            knowsAbout: ["MMA", "UFC", "mixed martial arts"],
            publishingPrinciples: `${siteUrl}/editorial-policy`,
            inLanguage: ["ru-RU", "en-US"]
          }}
        />
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "FightBase Media",
            url: siteUrl,
            publisher: {
              "@type": "Organization",
              name: "FightBase Media"
            },
            inLanguage: ["ru-RU", "en-US"]
          }}
        />
        <div className="page-shell">
          <Header />
          {children}
          <Footer />
        </div>
        <FloatingSocialLinks />
        <ScrollToTop />
      </body>
    </html>
  );
}
