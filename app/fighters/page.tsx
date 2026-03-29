import Link from "next/link";

import { FighterCard } from "@/components/cards";
import { PageHero } from "@/components/page-hero";
import { getFightersPageData } from "@/lib/db";
import { formatFighterStatus, formatWeightClass } from "@/lib/display";
import { getLocale } from "@/lib/i18n";

type FightersPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
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

  return (
    <main className="container">
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
                <Link href="/fighters" className="button-ghost filter-reset-link">
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
