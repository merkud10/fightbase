import type { Metadata } from "next";
import Link from "next/link";

export const revalidate = 300;

import { ArticleCard } from "@/components/cards";
import { FilterSection, FilterEmptyState } from "@/components/filter-section";
import { JsonLd } from "@/components/json-ld";
import { PageHero } from "@/components/page-hero";
import { Pagination } from "@/components/pagination";
import { getNewsPageData } from "@/lib/db";
import { formatArticleTagLabel } from "@/lib/display";
import { getLocale } from "@/lib/i18n";
import { buildLocaleAlternates, localizePath } from "@/lib/locale-path";
import { readParam } from "@/lib/search-params";
import { getSiteUrl } from "@/lib/site";

type NewsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ searchParams }: NewsPageProps): Promise<Metadata> {
  const locale = await getLocale();
  const params = (await searchParams) ?? {};
  const tag = readParam(params.tag);
  const metaPage = readParam(params.page);
  const hasFilters = Boolean(tag || metaPage);
  const localizedUrl = localizePath("/news", locale);
  const title = locale === "ru" ? "Новости UFC" : "UFC News";
  const description =
    locale === "ru"
      ? "Новости UFC от FightBase Media: главные события, подтвержденные анонсы, результаты и важные изменения по бойцам и турнирам."
      : "UFC news from FightBase Media: major developments, confirmed announcements, results, and key fighter and event updates.";

  return {
    title,
    description,
    alternates: buildLocaleAlternates("/news"),
    openGraph: {
      title,
      description,
      url: localizedUrl
    },
    robots: hasFilters
      ? {
          index: false,
          follow: true
        }
      : undefined
  };
}


export default async function NewsPage({ searchParams }: NewsPageProps) {
  const locale = await getLocale();
  const params = (await searchParams) ?? {};
  const tag = readParam(params.tag);
  const pageParam = readParam(params.page);
  const page = Math.max(1, parseInt(pageParam, 10) || 1);
  const { tags, articles, totalCount, page: currentPage, totalPages, filters } = await getNewsPageData({
    promotion: "",
    tag,
    page
  });

  const current = {
    tag: filters.tag
  };
  const activeFiltersCount = [filters.tag].filter(Boolean).length;
  const siteUrl = getSiteUrl();
  const collectionUrl = new URL(localizePath("/news", locale), siteUrl).toString();
  const itemListElements = articles.slice(0, 12).map((article, index) => ({
    "@type": "ListItem",
    position: index + 1,
    url: new URL(localizePath(`/news/${article.slug}`, locale), siteUrl).toString(),
    name: article.title
  }));

  return (
    <main className="container">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: locale === "ru" ? "Новости UFC" : "UFC News",
          url: collectionUrl,
          inLanguage: locale === "ru" ? "ru-RU" : "en-US"
        }}
      />
      {itemListElements.length > 0 ? (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: locale === "ru" ? "Лента новостей UFC" : "UFC news feed",
            itemListElement: itemListElements
          }}
        />
      ) : null}

      <PageHero
        eyebrow="/news"
        title={locale === "ru" ? "Новости" : "News"}
        description={
          locale === "ru"
            ? "Главная новостная лента FightBase Media с фильтрами по темам и привязкой к бойцам и турнирам UFC."
            : "The main FightBase Media news feed with topic filters and links to UFC fighters and events."
        }
      />

      <section className="page-grid">
        <aside className="stack">
          <div className="filter-group fighter-filters">
            <div className="filter-head">
              <h3>{locale === "ru" ? "Фильтры" : "Filters"}</h3>
              {activeFiltersCount > 0 ? (
                <Link href={localizePath("/news", locale)} className="button-ghost filter-reset-link">
                  {locale === "ru" ? "Сбросить" : "Reset"}
                </Link>
              ) : null}
            </div>

            <FilterSection
              title={locale === "ru" ? "Темы" : "Topics"}
              items={tags.map((tagItem) => ({
                value: tagItem.slug,
                label: formatArticleTagLabel(tagItem.slug || tagItem.label, locale)
              }))}
              activeValue={filters.tag}
              basePath={localizePath("/news", locale)}
              current={current}
              param="tag"
              allLabel={locale === "ru" ? "Все" : "All"}
            />

            <p className="filter-results-copy">
              {locale === "ru" ? `Материалов: ${totalCount}` : `Stories: ${totalCount}`}
            </p>
          </div>
        </aside>

        {articles.length > 0 ? (
          <div>
            <div className="story-grid">
              {articles.map((article) => (
                <ArticleCard key={article.id} article={article} locale={locale} />
              ))}
            </div>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              basePath={localizePath("/news", locale)}
              params={{ tag: filters.tag }}
              locale={locale}
            />
          </div>
        ) : (
          <FilterEmptyState
            heading={locale === "ru" ? "По этим фильтрам ничего не найдено" : "No articles match these filters"}
            description={locale === "ru"
              ? "По выбранным параметрам материалов не найдено. Сбросьте часть фильтров, чтобы расширить выборку."
              : "No stories match the selected filters. Clear some filters to broaden the list."}
          />
        )}
      </section>
    </main>
  );
}
