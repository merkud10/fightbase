import type { Metadata } from "next";
import { Inter, Oswald, Russo_One } from "next/font/google";

import "./globals.css";

import { Footer } from "@/components/footer";
import { FloatingSocialLinks } from "@/components/floating-social-links";
import { Header } from "@/components/header";
import { ScrollToTop } from "@/components/header-shell";
import { JsonLd } from "@/components/json-ld";
import { YandexMetrikaHit } from "@/components/yandex-metrika";
import { getLocale } from "@/lib/i18n";
import { buildLocaleAlternates, localizePath } from "@/lib/locale-path";
import { getSiteUrl } from "@/lib/site";
import { buildWebSiteJsonLd } from "@/lib/structured-data";

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
    icons: {
      icon: [
        { url: "/icon.png", type: "image/png" }
      ],
      apple: [
        { url: "/apple-icon.png", type: "image/png" }
      ],
      shortcut: ["/icon.png"]
    },
    formatDetection: {
      telephone: false,
      address: false,
      email: false
    },
    alternates: {
      ...buildLocaleAlternates("/"),
      types: {
        "application/rss+xml": [{ url: "/rss.xml", title: "FightBase Media — новости UFC" }]
      }
    },
    openGraph: {
      type: "website",
      locale: isRu ? "ru_RU" : "en_US",
      url: rootPath,
      siteName: "FightBase Media",
      title: "FightBase Media",
      description,
      images: [
        {
          url: "/gorilla-crown-logo.png",
          width: 1024,
          height: 1024,
          alt: "FightBase Media"
        }
      ]
    },
    twitter: {
      card: "summary_large_image",
      title: "FightBase Media",
      description,
      images: ["/gorilla-crown-logo.png"]
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
  const metrikaId = (process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID || "108511042").trim();

  return (
    <html lang={locale}>
      <head>
        {metrikaId ? (
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(m,e,t,r,i,k,a){
              m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
              m[i].l=1*new Date();
              for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}
              k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
            })(window,document,'script','https://mc.yandex.ru/metrika/tag.js?id=${metrikaId}','ym');
            ym(${metrikaId},'init',{defer:true,webvisor:true,clickmap:true,trackLinks:true,accurateTrackBounce:true});`
            }}
          />
        ) : null}
      </head>
      <body className={`${bodyFont.variable} ${headingFont.variable} ${navFont.variable}`}>
        <a className="skip-link" href="#main-content">
          {locale === "ru" ? "Перейти к содержанию" : "Skip to content"}
        </a>
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "NewsMediaOrganization",
            name: "FightBase Media",
            url: `${siteUrl}/ru`,
            areaServed: ["RU", "US", "Worldwide"],
            knowsAbout: ["MMA", "UFC", "mixed martial arts"],
            publishingPrinciples: `${siteUrl}/ru/editorial-policy`,
            inLanguage: "ru-RU"
          }}
        />
        <JsonLd data={buildWebSiteJsonLd(siteUrl)} />
        <div className="page-shell">
          <Header />
          <div id="main-content" className="main-content" tabIndex={-1}>
            {children}
          </div>
          <Footer />
        </div>
        <FloatingSocialLinks />
        <ScrollToTop label={locale === "ru" ? "Наверх" : "Scroll to top"} />
        <YandexMetrikaHit />
        {metrikaId ? (
          <noscript>
            <div>
              <img
                src={`https://mc.yandex.ru/watch/${metrikaId}`}
                style={{ position: "absolute", left: "-9999px" }}
                alt=""
              />
            </div>
          </noscript>
        ) : null}
      </body>
    </html>
  );
}
