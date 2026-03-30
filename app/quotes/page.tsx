import type { Metadata } from "next";
import Link from "next/link";

import { PageHero } from "@/components/page-hero";
import { getQuotesPageData } from "@/lib/db";
import { getLocale } from "@/lib/i18n";
import { buildLocaleAlternates } from "@/lib/locale-path";

export async function generateMetadata(): Promise<Metadata> {
  const quotes = await getQuotesPageData();

  return {
    title: "Цитаты и интервью MMA",
    description: "Ключевые цитаты, интервью и источниковые материалы по MMA.",
    alternates: buildLocaleAlternates("/quotes"),
    robots: quotes.length
      ? undefined
      : {
          index: false,
          follow: true
        }
  };
}

export default async function QuotesPage() {
  const locale = await getLocale();
  const quotes = await getQuotesPageData();

  return (
    <main className="container">
      <PageHero
        eyebrow="/quotes"
        title={locale === "ru" ? "Цитаты и интервью" : "Quotes and interviews"}
        description={
          locale === "ru"
            ? "Раздел для пресс-конференций, интервью, подкастов и материалов с явными ссылками на источники."
            : "A safer format for press conferences, interviews, podcasts, and social-media monitoring with explicit source links."
        }
      />

      <section className="feature-grid">
        {quotes.map((article) => (
          <article key={article.id} className="feature-card">
            <p className="eyebrow">{locale === "ru" ? "Цитата" : "Quote"}</p>
            <h3>{article.title}</h3>
            <p className="copy">{article.meaning}</p>
            <Link href={`/news/${article.slug}`}>{locale === "ru" ? "Открыть материал" : "Open coverage"}</Link>
          </article>
        ))}
      </section>
    </main>
  );
}
