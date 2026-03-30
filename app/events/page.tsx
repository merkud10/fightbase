import type { Metadata } from "next";
import Link from "next/link";

import { EventCard } from "@/components/cards";
import { JsonLd } from "@/components/json-ld";
import { PageHero } from "@/components/page-hero";
import { getEventsPageData } from "@/lib/db";
import { getLocale } from "@/lib/i18n";
import { buildLocaleAlternates, localizePath } from "@/lib/locale-path";
import { getSiteUrl } from "@/lib/site";

type EventsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export async function generateMetadata({ searchParams }: EventsPageProps): Promise<Metadata> {
  const locale = await getLocale();
  const params = (await searchParams) ?? {};
  const promotion = readParam(params.promotion);
  const status = readParam(params.status);
  const hasFilters = Boolean(promotion || status);
  const localizedUrl = localizePath("/events", locale);

  return {
    title: "Турниры MMA",
    description:
      "Турниры MMA на FightBase Media: ближайшие и прошедшие события UFC, PFL и ONE, карточки боёв, даты и площадки.",
    alternates: buildLocaleAlternates("/events"),
    openGraph: {
      title: "Турниры MMA",
      description:
        "Турниры MMA на FightBase Media: ближайшие и прошедшие события UFC, PFL и ONE, карточки боёв, даты и площадки.",
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

function buildFilterHref(current: { promotion: string; status: string }, next: Partial<{ promotion: string; status: string }>) {
  const params = new URLSearchParams();
  const merged = { ...current, ...next };

  if (merged.promotion) {
    params.set("promotion", merged.promotion);
  }

  if (merged.status) {
    params.set("status", merged.status);
  }

  const query = params.toString();
  return query ? `/events?${query}` : "/events";
}

function FilterSection({
  title,
  items,
  activeValue,
  current,
  param,
  allLabel
}: {
  title: string;
  items: Array<{ label: string; value: string }>;
  activeValue: string;
  current: { promotion: string; status: string };
  param: "promotion" | "status";
  allLabel: string;
}) {
  return (
    <div className="filter-block">
      <h4>{title}</h4>
      <div className="filter-chip-row">
        <Link
          href={buildFilterHref(current, { [param]: "" })}
          className={`filter-chip ${activeValue === "" ? "active" : ""}`}
        >
          {allLabel}
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

export default async function EventsPage({ searchParams }: EventsPageProps) {
  const locale = await getLocale();
  const params = (await searchParams) ?? {};
  const promotion = readParam(params.promotion);
  const status = readParam(params.status);
  const { events, filters, options } = await getEventsPageData({
    promotion,
    status
  });

  const current = {
    promotion: filters.promotion,
    status: filters.status
  };
  const activeFiltersCount = [filters.promotion, filters.status].filter(Boolean).length;
  const siteUrl = getSiteUrl();
  const collectionUrl = new URL("/events", siteUrl).toString();
  const itemListElements = events.slice(0, 12).map((event, index) => ({
    "@type": "ListItem",
    position: index + 1,
    url: new URL(`/events/${event.slug}`, siteUrl).toString(),
    name: event.name
  }));

  return (
    <main className="container">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: locale === "ru" ? "Турниры MMA" : "MMA events",
          url: collectionUrl,
          inLanguage: locale === "ru" ? "ru-RU" : "en-US"
        }}
      />
      {itemListElements.length > 0 ? (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: locale === "ru" ? "Календарь турниров" : "Event calendar",
            itemListElement: itemListElements
          }}
        />
      ) : null}

      <PageHero
        eyebrow="/events"
        title={locale === "ru" ? "Турниры" : "Events"}
        description={
          locale === "ru"
            ? "Предстоящие и прошедшие турниры с карточками событий, главным боем и переходом к подробной странице."
            : "Upcoming and completed events with event cards, main fights, and detailed pages."
        }
      />

      <section className="page-grid">
        <aside className="stack">
          <div className="filter-group fighter-filters">
            <div className="filter-head">
              <h3>{locale === "ru" ? "Фильтры" : "Filters"}</h3>
              {activeFiltersCount > 0 ? (
                <Link href="/events" className="button-ghost filter-reset-link">
                  {locale === "ru" ? "Сбросить" : "Reset"}
                </Link>
              ) : null}
            </div>

            <FilterSection
              title={locale === "ru" ? "Статус" : "Status"}
              items={options.statuses.map((item) => ({
                value: item,
                label:
                  locale === "ru"
                    ? item === "upcoming"
                      ? "Предстоящие"
                      : item === "live"
                        ? "Идут сейчас"
                        : "Прошедшие"
                    : item === "upcoming"
                      ? "Upcoming"
                      : item === "live"
                        ? "Live"
                        : "Past"
              }))}
              activeValue={filters.status}
              current={current}
              param="status"
              allLabel={locale === "ru" ? "Все" : "All"}
            />

            <FilterSection
              title={locale === "ru" ? "Лиги" : "Promotions"}
              items={options.promotions.map((item) => ({
                value: item.slug,
                label: item.shortName || item.name
              }))}
              activeValue={filters.promotion}
              current={current}
              param="promotion"
              allLabel={locale === "ru" ? "Все" : "All"}
            />

            <p className="filter-results-copy">
              {locale === "ru" ? `Найдено турниров: ${events.length}` : `Events found: ${events.length}`}
            </p>
          </div>
        </aside>

        {events.length > 0 ? (
          <div className="event-grid">
            {events.map((event) => (
              <EventCard key={event.id} event={event} locale={locale} />
            ))}
          </div>
        ) : (
          <section className="filter-empty-state">
            <h3>{locale === "ru" ? "По этим фильтрам ничего не найдено" : "No events match these filters"}</h3>
            <p className="copy">
              {locale === "ru"
                ? "Попробуй снять часть фильтров, чтобы расширить выборку турниров."
                : "Try clearing some filters to broaden the event list."}
            </p>
          </section>
        )}
      </section>
    </main>
  );
}
