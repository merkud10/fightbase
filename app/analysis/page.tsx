import type { Metadata } from "next";
import Link from "next/link";

export const dynamic = "force-dynamic";

import { ArticleCard } from "@/components/cards";
import { JsonLd } from "@/components/json-ld";
import { PageHero } from "@/components/page-hero";
import { Pagination } from "@/components/pagination";
import { getArticleHref } from "@/lib/article-routes";
import { getAnalysisPageData } from "@/lib/db";
import { getLocale } from "@/lib/i18n";
import { localizePath } from "@/lib/locale-path";
import { buildPageMetadata } from "@/lib/page-metadata";
import { readParam } from "@/lib/search-params";
import { getSiteUrl } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();

  return buildPageMetadata({
    locale,
    path: "/analysis",
    title: locale === "ru" ? "Аналитика UFC" : "UFC analysis",
    description:
      locale === "ru"
        ? "Редакционные разборы FightBase Media: превью боёв UFC, стилистические матчапы и аналитические материалы по главным темам недели."
        : "FightBase Media editorial analysis: UFC fight previews, stylistic matchups, and in-depth coverage of the week’s key topics."
  });
}

export default async function AnalysisPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getLocale();
  const params = (await searchParams) ?? {};
  const page = Math.max(1, parseInt(readParam(params.page), 10) || 1);
  const { articles, page: currentPage, totalPages } = await getAnalysisPageData(page);
  const siteUrl = getSiteUrl();
  const pageUrl = new URL(localizePath("/analysis", locale), siteUrl).toString();
  const itemListElements = articles.slice(0, 12).map((article, index) => ({
    "@type": "ListItem",
    position: index + 1,
    url: new URL(localizePath(getArticleHref(article.category, article.slug), locale), siteUrl).toString(),
    name: article.title
  }));

  return (
    <main className="container">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: locale === "ru" ? "Аналитика UFC" : "UFC analysis",
          url: pageUrl,
          inLanguage: locale === "ru" ? "ru-RU" : "en-US"
        }}
      />
      {itemListElements.length > 0 ? (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: locale === "ru" ? "Аналитические материалы UFC" : "UFC analysis archive",
            itemListElement: itemListElements
          }}
        />
      ) : null}

      <PageHero
        title={locale === "ru" ? "Аналитика" : "Analysis"}
        description={
          locale === "ru"
            ? "Отдельный раздел для редакционных разборов: превью боев, стилистические конфликты, значение результата для дивизиона и более длинные тексты, чем в ленте новостей."
            : "A dedicated desk for fight previews, stylistic breakdowns, divisional context, and longer-form analysis."
        }
      />

      <section className="feature-grid">
        <article className="feature-card editorial-card">
          <p className="eyebrow">{locale === "ru" ? "Разделение форматов" : "Format split"}</p>
          <h3>{locale === "ru" ? "Не лента прогнозов, а архив аналитики" : "Not a prediction feed, but an analysis archive"}</h3>
          <p className="copy">
            {locale === "ru"
              ? "В разделе собраны материалы, которые живут дольше одного предматчевого цикла: большие разборы, контекст по дивизионам и тексты, к которым удобно возвращаться."
              : "This section keeps the editorial pieces that outlive a single fight week: longer breakdowns, divisional context, and evergreen analysis."}
          </p>
        </article>
        <article className="feature-card editorial-card">
          <p className="eyebrow">{locale === "ru" ? "Навигация" : "Navigation"}</p>
          <h3>{locale === "ru" ? "Прогнозы остаются в отдельном разделе" : "Predictions remain a separate desk"}</h3>
          <p className="copy">
            {locale === "ru"
              ? "Короткие snapshot-прогнозы и карточки боев живут в разделе прогнозов, а здесь остаются только редакционные тексты и более обстоятельная аналитика."
              : "Snapshot fight previews stay in Predictions, while this page focuses on editorial analysis and longer reads."}
          </p>
          <Link href={localizePath("/predictions", locale)}>{locale === "ru" ? "Открыть раздел прогнозов" : "Open predictions"}</Link>
        </article>
      </section>

      {articles.length > 0 ? (
        <section className="section">
          <div className="section-head">
            <div>
              <p className="eyebrow">{locale === "ru" ? "Материалы" : "Stories"}</p>
              <h2>{locale === "ru" ? "Редакционные разборы" : "Editorial analysis"}</h2>
            </div>
          </div>
          <div className="story-grid">
            {articles.map((article) => (
              <ArticleCard key={article.id} article={article} locale={locale} />
            ))}
          </div>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            basePath={localizePath("/analysis", locale)}
            locale={locale}
          />
        </section>
      ) : (
        <section className="filter-empty-state">
          <h3>{locale === "ru" ? "Раздел аналитики пока пуст" : "The analysis desk is currently empty"}</h3>
          <p className="copy">
            {locale === "ru"
              ? "После публикации больших разборов и превью они будут появляться здесь отдельным архивом, без смешения с лентой новостей."
              : "Longer breakdowns and feature previews will appear here once they are published."}
          </p>
        </section>
      )}
    </main>
  );
}
