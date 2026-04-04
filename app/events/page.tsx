import type { Metadata } from "next";
import Link from "next/link";

export const revalidate = 3600;

import { FilterEmptyState, FilterSection } from "@/components/filter-section";
import { JsonLd } from "@/components/json-ld";
import { PageHero } from "@/components/page-hero";
import { Pagination } from "@/components/pagination";
import { getEventsPageData } from "@/lib/db";
import { formatEventLocation, formatWeightClass, getDisplayName } from "@/lib/display";
import { getDictionary, getLocale } from "@/lib/i18n";
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
  const metaPage = readParam(params.page);
  const hasFilters = Boolean(status || metaPage);
  const localizedUrl = localizePath("/events", locale);

  const title = locale === "ru" ? "Турниры UFC" : "UFC events";
  const description =
    locale === "ru"
      ? "Календарь турниров UFC с основными данными по событиям, составом боев и отдельными страницами турниров."
      : "A UFC event calendar with core event details, fight lineups, and dedicated event pages.";

  return {
    title,
    description,
    alternates: buildLocaleAlternates("/events"),
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

export default async function EventsPage({ searchParams }: EventsPageProps) {
  const locale = await getLocale();
  const t = getDictionary(locale);
  const params = (await searchParams) ?? {};
  const status = readParam(params.status);
  const pageParam = readParam(params.page);
  const page = Math.max(1, parseInt(pageParam, 10) || 1);
  const { events, totalCount, page: currentPage, totalPages, filters, options } = await getEventsPageData({
    promotion: "",
    status,
    page
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
              {locale === "ru" ? `Турниров: ${totalCount}` : `Events: ${totalCount}`}
            </p>
          </div>
        </aside>

        {events.length > 0 ? (
          <div>
            <div className="events-editorial-list">
              {events.map((event) => {
                const leadFight = event.fights?.[0] ?? null;
                const previewFights = (event.fights ?? []).slice(0, 3);
                const date = new Date(event.date);
                const monthLabel = date
                  .toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US", { month: "short" })
                  .replace(".", "")
                  .toUpperCase();
                const dayLabel = date.toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US", { day: "2-digit" });
                const yearLabel = date.getFullYear();
                const statusLabel =
                  locale === "ru"
                    ? event.status === "completed"
                      ? "Прошедший турнир"
                      : event.status === "live"
                        ? "Идет сейчас"
                        : "Ближайший турнир"
                    : event.status === "completed"
                      ? "Completed event"
                      : event.status === "live"
                        ? "Live now"
                        : "Upcoming event";

                return (
                  <article key={event.id} className="event-listing-row editorial-surface">
                    <div className="event-listing-date">
                      <span className="event-listing-day">{dayLabel}</span>
                      <span className="event-listing-month">{monthLabel}</span>
                      <span className="event-listing-year">{yearLabel}</span>
                    </div>

                    <div className="event-listing-main">
                      <div className="event-listing-topline">
                        <span className="event-listing-status">{statusLabel}</span>
                        <span className="event-listing-divider" />
                        <span className="event-listing-location">{formatEventLocation(event.city, event.venue, locale)}</span>
                      </div>

                      <h3 className="event-listing-title">
                        <Link href={localizePath(`/events/${event.slug}`, locale)}>{event.name}</Link>
                      </h3>

                      {leadFight ? (
                        <p className="event-listing-headliner">
                          <span className="event-listing-label">{locale === "ru" ? "Главный бой" : "Main event"}</span>
                          <strong>
                            {getDisplayName(leadFight.fighterA, locale)} vs {getDisplayName(leadFight.fighterB, locale)}
                          </strong>
                          <span>{formatWeightClass(leadFight.weightClass, locale)}</span>
                        </p>
                      ) : null}

                      <p className="event-listing-summary">{event.summary}</p>

                      {previewFights.length > 0 ? (
                        <div className="event-listing-fights">
                          {previewFights.map((fight) => (
                            <div key={fight.id} className="event-listing-fight-row">
                              <div className="event-listing-fight-copy">
                                <strong>
                                  {getDisplayName(fight.fighterA, locale)} vs {getDisplayName(fight.fighterB, locale)}
                                </strong>
                                <span>{formatWeightClass(fight.weightClass, locale)}</span>
                              </div>

                              {fight.predictionSnapshot ? (
                                <Link
                                  href={localizePath(`/predictions/${event.slug}/${fight.slug}`, locale)}
                                  className="event-listing-fight-link"
                                >
                                  {t.common.openPrediction}
                                </Link>
                              ) : (
                                <span className="event-listing-fight-link event-listing-fight-link--pending">
                                  {locale === "ru" ? "Прогноз ожидается" : "Prediction pending"}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="event-listing-actions">
                      <Link href={localizePath(`/events/${event.slug}`, locale)} className="button-secondary event-listing-button">
                        {t.common.eventCard}
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              basePath={localizePath("/events", locale)}
              params={{ status: filters.status }}
              locale={locale}
            />
          </div>
        ) : (
          <FilterEmptyState
            heading={locale === "ru" ? "По этим фильтрам ничего не найдено" : "No events match these filters"}
            description={
              locale === "ru"
                ? "По выбранным параметрам турниров не найдено. Сбросьте часть фильтров, чтобы увидеть больше событий."
                : "No events match the selected filters. Clear some filters to view a broader schedule."
            }
          />
        )}
      </section>
    </main>
  );
}
