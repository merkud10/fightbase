import type { Metadata } from "next";
import Link from "next/link";

import { EventCard } from "@/components/cards";
import { FilterSection, FilterEmptyState } from "@/components/filter-section";
import { JsonLd } from "@/components/json-ld";
import { PageHero } from "@/components/page-hero";
import { getEventsPageData } from "@/lib/db";
import { getLocale } from "@/lib/i18n";
import { buildLocaleAlternates, localizePath } from "@/lib/locale-path";
import { readParam } from "@/lib/search-params";
import { getSiteUrl } from "@/lib/site";

type EventsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ searchParams }: EventsPageProps): Promise<Metadata> {
  const locale = await getLocale();
  const params = (await searchParams) ?? {};
  const status = readParam(params.status);
  const hasFilters = Boolean(status);
  const localizedUrl = localizePath("/events", locale);

  return {
    title: locale === "ru" ? "Турниры UFC" : "UFC events",
    description:
      locale === "ru"
        ? "Календарь турниров UFC с основными данными по событиям, составом боев и отдельными страницами турниров."
        : "A UFC event calendar with core event details, fight lineups, and dedicated event pages.",
    alternates: buildLocaleAlternates("/events"),
    openGraph: {
      title: locale === "ru" ? "Турниры UFC" : "UFC events",
      description:
        locale === "ru"
          ? "Календарь турниров UFC с основными данными по событиям, составом боев и отдельными страницами турниров."
          : "A UFC event calendar with core event details, fight lineups, and dedicated event pages.",
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


export default async function EventsPage({ searchParams }: EventsPageProps) {
  const locale = await getLocale();
  const params = (await searchParams) ?? {};
  const status = readParam(params.status);
  const { events, filters, options } = await getEventsPageData({
    promotion: "",
    status
  });

  const current = {
    status: filters.status
  };
  const activeFiltersCount = [filters.status].filter(Boolean).length;
  const siteUrl = getSiteUrl();
  const collectionUrl = new URL(localizePath("/events", locale), siteUrl).toString();
  const itemListElements = events.slice(0, 12).map((event, index) => ({
    "@type": "ListItem",
    position: index + 1,
    url: new URL(localizePath(`/events/${event.slug}`, locale), siteUrl).toString(),
    name: event.name
  }));

  return (
    <main className="container">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: locale === "ru" ? "Турниры UFC" : "UFC events",
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
            ? "Предстоящие и прошедшие турниры с основными данными, составом боев и ссылками на связанные материалы."
            : "Upcoming and completed events with key details, fight lineups, and links to related coverage."
        }
      />

      <section className="page-grid">
        <aside className="stack">
          <div className="filter-group fighter-filters">
            <div className="filter-head">
              <h3>{locale === "ru" ? "Фильтры" : "Filters"}</h3>
              {activeFiltersCount > 0 ? (
                <Link href={localizePath("/events", locale)} className="button-ghost filter-reset-link">
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
              basePath={localizePath("/events", locale)}
              current={current}
              param="status"
              allLabel={locale === "ru" ? "Все" : "All"}
            />

            <p className="filter-results-copy">
              {locale === "ru" ? `Турниров: ${events.length}` : `Events: ${events.length}`}
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
          <FilterEmptyState
            heading={locale === "ru" ? "По этим фильтрам ничего не найдено" : "No events match these filters"}
            description={locale === "ru"
              ? "По выбранным параметрам турниров не найдено. Сбросьте часть фильтров, чтобы увидеть больше событий."
              : "No events match the selected filters. Clear some filters to view a broader schedule."}
          />
        )}
      </section>
    </main>
  );
}
