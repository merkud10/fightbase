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
        ? "Превью турниров UFC и разборы боёв: расклады перед турниром и итоги после него."
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
            ? "Превью турниров и разборы боёв: что стоит на кону перед турниром и что изменилось после."
            : "A dedicated desk for fight previews, stylistic breakdowns, divisional context, and longer-form analysis."
        }
      />

      {articles.length > 0 ? (
        <section className="section">
          <div className="section-head">
            <div>
              <h2>{locale === "ru" ? "Превью и разборы" : "Editorial analysis"}</h2>
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
          <h3>{locale === "ru" ? "Материалов пока нет" : "The analysis desk is currently empty"}</h3>
          <p className="copy">
            {locale === "ru"
              ? "Превью и разборы появятся перед ближайшим турниром."
              : "Longer breakdowns and feature previews will appear here once they are published."}
          </p>
        </section>
      )}
    </main>
  );
}
