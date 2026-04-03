// @ts-nocheck
import type { Metadata } from "next";
import Link from "next/link";

import { FighterCard } from "@/components/cards";
import { FilterSection, FilterEmptyState } from "@/components/filter-section";
import { JsonLd } from "@/components/json-ld";
import { PageHero } from "@/components/page-hero";
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
  const status = readParam(params.status);
  const weightClass = readParam(params.weightClass);
  const hasFilters = Boolean(status || weightClass);
  const localizedUrl = localizePath("/fighters", locale);
  const title = locale === "ru" ? "Бойцы UFC" : "UFC Fighters";
  const description =
    locale === "ru"
      ? "Профили бойцов UFC: статистика, последние бои и фильтры по дивизионам и статусу."
      : "Fighter profiles for UFC with stats, recent fights, and filters by division and status.";

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
  const status = readParam(params.status);
  const weightClass = readParam(params.weightClass);
  const { fighters, filters, options } = await getFightersPageData({
    promotion: "",
    status,
    weightClass
  });

  const current = {
    status: filters.status,
    weightClass: filters.weightClass
  };
  const activeFiltersCount = [filters.status, filters.weightClass].filter(Boolean).length;
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
            ? "Профили бойцов с фильтрами по статусам и весовым категориям."
            : "Fighter profiles with filters for statuses and weight classes."
        }
      />

      <section className="page-grid">
        <aside className="stack">
          <div className="filter-group fighter-filters">
            <div className="filter-head">
              <h3>{locale === "ru" ? "Фильтры" : "Filters"}</h3>
              {activeFiltersCount > 0 ? (
                <Link href={localizePath("/fighters", locale)} className="button-ghost filter-reset-link">
                  {locale === "ru" ? "Сбросить" : "Reset"}
                </Link>
              ) : null}
            </div>

            <FilterSection
              title={locale === "ru" ? "Статус" : "Status"}
              items={options.statuses.map((item) => ({
                value: item,
                label: formatFighterStatus(item, locale)
              }))}
              activeValue={filters.status}
              basePath={localizePath("/fighters", locale)}
              current={current}
              param="status"
            />

            <FilterSection
              title={locale === "ru" ? "Весовые категории" : "Weight classes"}
              items={options.weightClasses.map((item) => ({
                value: item,
                label: formatWeightClass(item, locale)
              }))}
              activeValue={filters.weightClass}
              basePath={localizePath("/fighters", locale)}
              current={current}
              param="weightClass"
            />

            <p className="filter-results-copy">
              {locale === "ru" ? `Бойцов: ${fighters.length}` : `Fighters: ${fighters.length}`}
            </p>
          </div>
        </aside>

        {fighters.length > 0 ? (
          <div className="fighter-grid">
            {fighters.filter(Boolean).map((fighter) => (
              <FighterCard key={fighter.id} fighter={fighter} locale={locale} />
            ))}
          </div>
        ) : (
          <FilterEmptyState
            heading={locale === "ru" ? "По этим фильтрам ничего не найдено" : "No fighters match these filters"}
            description={locale === "ru"
              ? "По выбранным параметрам бойцы не найдены. Сбросьте часть фильтров, чтобы расширить выборку."
              : "No fighters match the selected filters. Clear some filters to broaden the results."}
          />
        )}
      </section>
    </main>
  );
}
