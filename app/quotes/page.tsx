import Link from "next/link";

import { PageHero } from "@/components/page-hero";
import { articles } from "@/lib/data";
import { getLocale } from "@/lib/i18n";

export default async function QuotesPage() {
  const locale = await getLocale();
  const quotes = articles.filter((article) => article.category === "interview");

  return (
    <main className="container">
      <PageHero
        eyebrow="/quotes"
        title={locale === "ru" ? "Цитаты и интервью" : "Quotes and interviews"}
        description={
          locale === "ru"
            ? "Более безопасный формат для пресс-конференций, интервью, подкастов и мониторинга соцсетей с явными ссылками на источники."
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
