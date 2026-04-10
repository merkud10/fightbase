import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

export const revalidate = 3600;

import { FighterCard } from "@/components/cards";
import { FilterSection, FilterEmptyState } from "@/components/filter-section";
import { JsonLd } from "@/components/json-ld";
import { PageHero } from "@/components/page-hero";
import { Pagination } from "@/components/pagination";
import { getFightersPageData } from "@/lib/db";
import { formatFighterStatus, formatWeightClass } from "@/lib/display";
import { getLocale } from "@/lib/i18n";
import { buildLocaleAlternates, localizePath } from "@/lib/locale-path";
import { readParam } from "@/lib/search-params";
import { getSiteUrl } from "@/lib/site";

type FightersPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ searchParams }: FightersPageProps): Promise<Metadata> {
  const locale = await getLocale();
  const params = (await searchParams) ?? {};
  const query = readParam(params.query);
  const status = readParam(params.status);
  const weightClass = readParam(params.weightClass);
  const metaPage = readParam(params.page);
  const hasFilters = Boolean(query || status || weightClass || metaPage);
  const localizedUrl = localizePath("/fighters", locale);
  const title = locale === "ru" ? "Бойцы UFC" : "UFC Fighters";
  const description =
    locale === "ru"
      ? "Профили бойцов UFC: статистика, последние бои и поиск по имени на русском или английском."
      : "UFC fighter profiles with stats, recent fights, and name search in English or Russian.";

  return {
    title,
    description,
    alternates: buildLocaleAlternates("/fighters"),
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

export default async function FightersPage({ searchParams }: FightersPageProps) {
  const locale = await getLocale();
  const params = (await searchParams) ?? {};
  const query = readParam(params.query);
  const status = readParam(params.status);
  const weightClass = readParam(params.weightClass);
  const pageParam = readParam(params.page);
  const page = Math.max(1, parseInt(pageParam, 10) || 1);
  const basePath = localizePath("/fighters", locale);
  const { fighters, totalCount, page: currentPage, totalPages, filters, options } = await getFightersPageData({
    query,
    promotion: "",
    status,
    weightClass,
    page
  });

  if (pageParam && currentPage !== page) {
    notFound();
  }

  const current = {
    query: filters.query,
    status: filters.status,
    weightClass: filters.weightClass
  };
  const activeFiltersCount = [filters.query, filters.status, filters.weightClass].filter(Boolean).length;
  const siteUrl = getSiteUrl();
  const collectionUrl = new URL("/fighters", siteUrl).toString();
  const itemListElements = fighters.slice(0, 24).filter(Boolean).map((fighter, index) => ({
    "@type": "ListItem",
    position: index + 1,
    url: new URL(`/fighters/${fighter.slug}`, siteUrl).toString(),
    name: locale === "ru" ? fighter.nameRu || fighter.name : fighter.name
  }));

  return (
    <main className="container">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: locale === "ru" ? "Бойцы UFC" : "UFC fighters",
          url: collectionUrl,
          inLanguage: locale === "ru" ? "ru-RU" : "en-US"
        }}
      />
      {itemListElements.length > 0 ? (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: locale === "ru" ? "Каталог бойцов" : "Fighter directory",
            itemListElement: itemListElements
          }}
        />
      ) : null}

      <PageHero
        eyebrow="/fighters"
        title={locale === "ru" ? "Бойцы" : "Fighters"}
        description={
          locale === "ru"
            ? "Профили бойцов с фильтрами по статусам, весовым категориям и поиском по имени."
            : "Fighter profiles with filters for statuses, weight classes, and name search."
        }
      />

      <section className="page-grid">
        <aside className="stack">
          <div className="filter-group fighter-filters">
            <div className="filter-head">
              <h3>{locale === "ru" ? "Фильтры" : "Filters"}</h3>
              {activeFiltersCount > 0 ? (
                <Link href={basePath} className="button-ghost filter-reset-link">
                  {locale === "ru" ? "Сбросить" : "Reset"}
                </Link>
              ) : null}
            </div>

            <form action={basePath} method="get" className="fighter-search-form">
              {filters.status ? <input type="hidden" name="status" value={filters.status} /> : null}
              {filters.weightClass ? <input type="hidden" name="weightClass" value={filters.weightClass} /> : null}
              <label className="fighter-search-label" htmlFor="fighter-search">
                {locale === "ru" ? "Поиск бойца" : "Find a fighter"}
              </label>
              <div className="fighter-search-row">
                <input
                  id="fighter-search"
                  name="query"
                  type="search"
                  defaultValue={filters.query}
                  className="fighter-search-input"
                  placeholder={locale === "ru" ? "Введите имя на русском или английском" : "Search in English or Russian"}
                />
                <button type="submit" className="button-primary fighter-search-button">
                  {locale === "ru" ? "Найти" : "Search"}
                </button>
              </div>
            </form>

            <FilterSection
              title={locale === "ru" ? "Статус" : "Status"}
              items={options.statuses.map((item) => ({
                value: item,
                label: formatFighterStatus(item, locale)
              }))}
              activeValue={filters.status}
              basePath={basePath}
              current={current}
              param="status"
              allLabel={locale === "ru" ? "Все" : "All"}
            />

            <FilterSection
              title={locale === "ru" ? "Весовые категории" : "Weight classes"}
              items={options.weightClasses.map((item) => ({
                value: item,
                label: formatWeightClass(item, locale)
              }))}
              activeValue={filters.weightClass}
              basePath={basePath}
              current={current}
              param="weightClass"
              allLabel={locale === "ru" ? "Все" : "All"}
            />

            <p className="filter-results-copy">
              {locale === "ru" ? `Бойцов: ${totalCount}` : `Fighters: ${totalCount}`}
            </p>
          </div>
        </aside>

        {fighters.length > 0 ? (
          <div>
            <div className="fighter-grid">
              {fighters.filter(Boolean).map((fighter) => (
                <FighterCard key={fighter.id} fighter={fighter} locale={locale} />
              ))}
            </div>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              basePath={basePath}
              params={{ query: filters.query, status: filters.status, weightClass: filters.weightClass }}
              locale={locale}
            />
          </div>
        ) : (
          <FilterEmptyState
            heading={locale === "ru" ? "По этим параметрам ничего не найдено" : "No fighters match these filters"}
            description={
              locale === "ru"
                ? "По выбранным параметрам или поисковому запросу бойцы не найдены. Сбросьте часть фильтров или измените запрос."
                : "No fighters match the selected filters or search query. Clear some filters or refine the query."
            }
          />
        )}
      </section>
    </main>
  );
}
