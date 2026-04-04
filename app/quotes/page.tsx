import type { Metadata } from "next";
import Link from "next/link";

import { PageHero } from "@/components/page-hero";
import { getArticleHref } from "@/lib/article-routes";
import { getQuotesPageData } from "@/lib/db";
import { getDisplayImageUrl } from "@/lib/image-proxy";
import { getLocale } from "@/lib/i18n";
import { buildLocaleAlternates, localizePath } from "@/lib/locale-path";

export async function generateMetadata(): Promise<Metadata> {
  const quotes = await getQuotesPageData();

  return {
    title: "Интервью и прямая речь UFC",
    description:
      "Интервью, заявления и материалы FightBase Media, построенные вокруг прямой речи бойцов, тренеров и участников UFC-повестки.",
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
        title={locale === "ru" ? "Интервью и прямая речь" : "Interviews and direct quotes"}
        description={
          locale === "ru"
            ? "Раздел для интервью, пресс-конференций и материалов, где особенно важны точные формулировки и смысл сказанного."
            : "A desk for interviews, press conferences, and quote-driven pieces where phrasing and meaning matter most."
        }
      />

      {quotes.length > 0 ? (
        <section className="feature-grid">
          {quotes.map((article) => (
            <article key={article.id} className="feature-card editorial-card">
              {article.coverImageUrl ? (
                <div className="editorial-card-cover">
                  <img
                    src={getDisplayImageUrl(article.coverImageUrl)}
                    alt={article.coverImageAlt || article.title}
                    className="editorial-card-cover-image"
                  />
                </div>
              ) : null}
              <p className="eyebrow">{locale === "ru" ? "Прямая речь" : "Direct quote"}</p>
              <h3>{article.title}</h3>
              <p className="copy">{article.excerpt || article.meaning}</p>
              <Link href={localizePath(getArticleHref(article.category, article.slug), locale)}>
                {locale === "ru" ? "Читать материал" : "Read story"}
              </Link>
            </article>
          ))}
        </section>
      ) : (
        <section className="filter-empty-state">
          <h3>{locale === "ru" ? "Раздел интервью пока пуст" : "The interview desk is currently empty"}</h3>
          <p className="copy">
            {locale === "ru"
              ? "После загрузки интервью и пресс-конференций они будут собираться здесь как отдельная редакционная витрина."
              : "Once interviews and press-conference coverage are published, they will appear here as a separate editorial desk."}
          </p>
        </section>
      )}
    </main>
  );
}
