import type { Metadata } from "next";
import Link from "next/link";

import { FighterCard } from "@/components/cards";
import { JsonLd } from "@/components/json-ld";
import { PageHero } from "@/components/page-hero";
import { getFightersPageData } from "@/lib/db";
import { formatFighterStatus, formatWeightClass } from "@/lib/display";
import { getLocale } from "@/lib/i18n";
import { buildLocaleAlternates, localizePath } from "@/lib/locale-path";
import { getSiteUrl } from "@/lib/site";

type FightersPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export async function generateMetadata({ searchParams }: FightersPageProps): Promise<Metadata> {
  const locale = await getLocale();
  const params = (await searchParams) ?? {};
  const promotion = readParam(params.promotion);
  const status = readParam(params.status);
  const weightClass = readParam(params.weightClass);
  const hasFilters = Boolean(promotion || status || weightClass);
  const localizedUrl = localizePath("/fighters", locale);
  const title = locale === "ru" ? "Бойцы MMA" : "MMA Fighters";
  const description =
    locale === "ru"
      ? "Каталог бойцов FightBase Media: профили UFC, PFL и ONE с фотографиями, статистикой, последними боями и быстрыми фильтрами по дивизионам."
      : "FightBase Media fighter directory: UFC, PFL, and ONE profiles with photos, stats, recent fights, and quick filters by division.";

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

function buildFilterHref(
  current: { promotion: string; status: string; weightClass: string },
  next: Partial<{ promotion: string; status: string; weightClass: string }>
) {
  const params = new URLSearchParams();
  const merged = { ...current, ...next };

  if (merged.promotion) {
    params.set("promotion", merged.promotion);
  }
  if (merged.status) {
    params.set("status", merged.status);
  }
  if (merged.weightClass) {
    params.set("weightClass", merged.weightClass);
  }

  const query = params.toString();
  return query ? `/fighters?${query}` : "/fighters";
}

function FilterSection({
  title,
  items,
  activeValue,
  current,
  param
}: {
  title: string;
  items: Array<{ label: string; value: string }>;
  activeValue: string;
  current: { promotion: string; status: string; weightClass: string };
  param: "promotion" | "status" | "weightClass";
}) {
  return (
    <div className="filter-block">
      <h4>{title}</h4>
      <div className="filter-chip-row">
        <Link
          href={buildFilterHref(current, { [param]: "" })}
          className={`filter-chip ${activeValue === "" ? "active" : ""}`}
        >
          Все
        </Link>
        {items.map((item) => (
          <Link
            key={item.value}
            href={buildFilterHref(current, { [param]: activeValue === item.value ? "" : item.value })}
            className={`filter-chip ${activeValue === item.value ? "active" : ""}`}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default async function FightersPage({ searchParams }: FightersPageProps) {
  const locale = await getLocale();
  const params = (await searchParams) ?? {};
  const promotion = readParam(params.promotion);
  const status = readParam(params.status);
  const weightClass = readParam(params.weightClass);
  const { fighters, filters, options } = await getFightersPageData({
    promotion,
    status,
    weightClass
  });

  const current = {
    promotion: filters.promotion,
    status: filters.status,
    weightClass: filters.weightClass
  };
  const activeFiltersCount = [filters.promotion, filters.status, filters.weightClass].filter(Boolean).length;
  const siteUrl = getSiteUrl();
  const collectionUrl = new URL("/fighters", siteUrl).toString();
  const itemListElements = fighters.slice(0, 24).map((fighter, index) => ({
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
          name: locale === "ru" ? "Бойцы MMA" : "MMA fighters",
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
            ? "Каталог бойцов с быстрыми фильтрами по лигам, статусам и весовым категориям."
            : "Fighter catalog with quick filters for promotions, statuses, and weight classes."
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
              title={locale === "ru" ? "Лиги" : "Promotions"}
              items={options.promotions.map((item) => ({
                value: item.slug,
                label: item.shortName || item.name
              }))}
              activeValue={filters.promotion}
              current={current}
              param="promotion"
            />

            <FilterSection
              title={locale === "ru" ? "Статус" : "Status"}
              items={options.statuses.map((item) => ({
                value: item,
                label: formatFighterStatus(item, locale)
              }))}
              activeValue={filters.status}
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
              current={current}
              param="weightClass"
            />

            <p className="filter-results-copy">
              {locale === "ru" ? `Найдено бойцов: ${fighters.length}` : `Fighters found: ${fighters.length}`}
            </p>
          </div>
        </aside>

        {fighters.length > 0 ? (
          <div className="fighter-grid">
            {fighters.map((fighter) => (
              <FighterCard key={fighter.id} fighter={fighter} locale={locale} />
            ))}
          </div>
        ) : (
          <section className="filter-empty-state">
            <h3>{locale === "ru" ? "По этим фильтрам ничего не найдено" : "No fighters match these filters"}</h3>
            <p className="copy">
              {locale === "ru"
                ? "Попробуй снять часть кнопок-фильтров и расширить выборку."
                : "Try clearing some filter buttons to broaden the results."}
            </p>
          </section>
        )}
      </section>
    </main>
  );
}
