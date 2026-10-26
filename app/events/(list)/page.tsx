import type { Metadata } from "next";
import Link from "next/link";

export const revalidate = 3600;

import { Breadcrumbs } from "@/components/breadcrumbs";
import { FilterEmptyState, FilterSection } from "@/components/filter-section";
import { JsonLd } from "@/components/json-ld";
import { PageHero } from "@/components/page-hero";
import { Pagination } from "@/components/pagination";
import { getEventsPageData, getScheduleHubData } from "@/lib/db";
import { formatEventLocation, formatFightMethod, formatWeightClass, getDisplayName } from "@/lib/display";
import { buildScheduleRows } from "@/lib/event-schedule";
import { formatCardTime } from "@/lib/event-time";
import { formatWinnerlessFightResult, getMainEventFight, sortFightsForCard } from "@/lib/fight-card";
import { getDictionary, getLocale } from "@/lib/i18n";
import { buildLocaleAlternates, localizePath } from "@/lib/locale-path";
import { readParam } from "@/lib/search-params";
import { ogImageUrl } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site";
import { buildTrailBreadcrumbJsonLd } from "@/lib/structured-data";

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

  const year = new Date().getFullYear();
  const title =
    locale === "ru" ? `Расписание UFC (ЮФС) ${year}: ближайшие турниры, даты и время по Москве` : `UFC ${year} event schedule`;
  const description =
    locale === "ru"
      ? `Расписание турниров UFC (ЮФС) на ${year} год: все ближайшие турниры одной таблицей — даты, главные бои, начало основного карда по Москве, полные карды с прогнозами FightBase и результаты последних турниров.`
      : `Upcoming UFC events and the full ${year} schedule: dates, start times, fight cards, FightBase picks for every bout, and results of past events.`;

  return {
    title,
    description,
    alternates: buildLocaleAlternates("/events"),
    openGraph: {
      title,
      description,
      url: localizedUrl,
      images: [ogImageUrl()]
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
  // Без фильтра хаб — расписание: таблица всех предстоящих турниров, их карточки и
  // последние результаты (lib/event-schedule.ts). Фильтр по статусу — прежний список.
  const scheduleMode = !status;
  const schedule = scheduleMode ? await getScheduleHubData() : null;
  const listing = scheduleMode ? null : await getEventsPageData({ promotion: "", status, page });
  const events = schedule ? schedule.upcoming : listing!.events;
  const totalCount = schedule ? schedule.upcoming.length : listing!.totalCount;
  const currentPage = listing?.page ?? 1;
  const totalPages = listing?.totalPages ?? 1;
  const filters = listing?.filters ?? { status: "" };
  const options = { statuses: ["upcoming", "live", "completed"] as const };
  const scheduleRows = schedule ? buildScheduleRows(schedule.upcoming) : [];
  const dayMonth = (date: Date) =>
    new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { day: "numeric", month: "long", timeZone: "UTC" }).format(date);

  const current = {
    status: filters.status
  };
  const activeFiltersCount = [filters.status].filter(Boolean).length;
  const siteUrl = getSiteUrl();
  const collectionUrl = new URL(localizePath("/events", locale), siteUrl).toString();
  const breadcrumbItems = [
    { label: locale === "ru" ? "Главная" : "Home", href: "/" },
    { label: locale === "ru" ? "Турниры" : "Events" }
  ];
  const itemListElements = events.slice(0, 12).map((event, index) => ({
    "@type": "ListItem",
    position: index + 1,
    url: new URL(localizePath(`/events/${event.slug}`, locale), siteUrl).toString(),
    name: event.name
  }));

  return (
    <main className="container">
      <JsonLd
        data={buildTrailBreadcrumbJsonLd(breadcrumbItems, { locale, siteUrl, currentUrl: collectionUrl })}
      />
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

      <Breadcrumbs items={breadcrumbItems} locale={locale} />
      <PageHero
        eyebrow="/events"
        title={locale === "ru" ? "Расписание турниров UFC (ЮФС)" : "UFC event schedule"}
        description={(() => {
          const nearest = !filters.status && currentPage === 1 ? events.find((event) => event.status !== "completed") : undefined;
          const nearestLine = nearest
            ? locale === "ru"
              ? `Ближайший турнир UFC (ЮФС): ${nearest.name}, ${new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(nearest.date))}${nearest.mainCardAt ? `, главный кард в ${new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" }).format(new Date(nearest.mainCardAt))} мск` : ""}. `
              : `Next UFC event: ${nearest.name}, ${new Intl.DateTimeFormat("en-US", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(nearest.date))}. `
            : "";
          return locale === "ru"
            ? `${nearestLine}Даты и время по Москве всех предстоящих турниров, полные карды с прогнозами FightBase, результаты прошедших событий.`
            : `${nearestLine}Dates and start times of upcoming UFC events, full fight cards with FightBase picks, and results of past events.`;
        })()}
      />

      {scheduleRows.length > 0 ? (
        <section className="table-card editorial-card">
          <div className="ranking-table-head">
            <div className="ranking-head-copy">
              <h2>{locale === "ru" ? `Расписание UFC (ЮФС) на ${new Date().getFullYear()} год` : `UFC schedule ${new Date().getFullYear()}`}</h2>
              <p className="table-note">
                {locale === "ru"
                  ? "Все объявленные турниры. Время начала основного карда и прелимов — по Москве."
                  : "All announced events. Main card and prelims start times in UTC."}
              </p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="event-card-table">
              <caption className="sr-only">{locale === "ru" ? "Расписание турниров UFC" : "UFC event schedule"}</caption>
              <thead>
                <tr>
                  <th scope="col">{locale === "ru" ? "Дата" : "Date"}</th>
                  <th scope="col">{locale === "ru" ? "Турнир" : "Event"}</th>
                  <th scope="col">{locale === "ru" ? "Главный бой" : "Main event"}</th>
                  <th scope="col">{locale === "ru" ? "Начало (мск)" : "Start (UTC)"}</th>
                </tr>
              </thead>
              <tbody>
                {scheduleRows.map(({ event, mainFight, isNext }) => (
                  <tr key={event.slug}>
                    <td>
                      <strong>{dayMonth(new Date(event.date))}</strong>
                      {isNext ? <span className="event-table-pick">{locale === "ru" ? "Ближайший турнир" : "Next event"}</span> : null}
                    </td>
                    <td>
                      <Link href={localizePath(`/events/${event.slug}`, locale)}>{event.name}</Link>
                    </td>
                    <td>
                      {mainFight ? (
                        `${getDisplayName(mainFight.fighterA, locale)} — ${getDisplayName(mainFight.fighterB, locale)}`
                      ) : (
                        <span className="table-note">{locale === "ru" ? "объявят позже" : "TBA"}</span>
                      )}
                    </td>
                    <td>
                      {event.mainCardAt ? (
                        <>
                          {locale === "ru" ? "основной кард " : "main card "}
                          <strong>{formatCardTime(new Date(event.mainCardAt), locale)}</strong>
                          {event.prelimsAt ? (
                            <span className="event-table-pick">
                              {locale === "ru" ? "прелимы " : "prelims "}
                              {formatCardTime(new Date(event.prelimsAt), locale)}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="table-note">{locale === "ru" ? "время уточняется" : "time TBA"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

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
                const orderedFights = sortFightsForCard(event.fights ?? []);
                const leadFight = orderedFights[0] ?? null;
                const previewFights = orderedFights.slice(0, 3);
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

                              {fight.status === "completed" && fight.winnerFighterId ? (
                                <span className="event-listing-fight-result">
                                  {locale === "ru" ? "Победа: " : "W: "}
                                  <strong>
                                    {fight.winnerFighterId === fight.fighterAId
                                      ? getDisplayName(fight.fighterA, locale)
                                      : getDisplayName(fight.fighterB, locale)}
                                  </strong>
                                  {fight.method ? ` (${formatFightMethod(fight.method, locale)})` : ""}
                                </span>
                              ) : fight.status === "completed" ? (
                                <span className="event-listing-fight-result">
                                  {formatWinnerlessFightResult(fight.resultType, locale)}
                                </span>
                              ) : fight.predictionSnapshot ? (
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
            {scheduleMode ? null : (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                basePath={localizePath("/events", locale)}
                params={{ status: filters.status }}
                locale={locale}
              />
            )}
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

      {schedule && schedule.recent.length > 0 ? (
        <section className="stack">
          <h2>{locale === "ru" ? "Последние результаты UFC" : "Latest UFC results"}</h2>
          <div className="champions-grid">
            {schedule.recent.map((event) => {
              const main = getMainEventFight(event.fights);
              const winner = main?.winnerFighterId
                ? getDisplayName(main.winnerFighterId === main.fighterAId ? main.fighterA : main.fighterB, locale)
                : null;
              return (
                <section key={event.slug} className="policy-card champion-card">
                  <h3>
                    <Link href={localizePath(`/events/${event.slug}`, locale)}>{event.name}</Link>
                  </h3>
                  <p className="table-note">{dayMonth(new Date(event.date))}</p>
                  {main ? (
                    <p className="copy">
                      {getDisplayName(main.fighterA, locale)} — {getDisplayName(main.fighterB, locale)}
                      {winner ? (
                        <>
                          {locale === "ru" ? ". Победа: " : ". Winner: "}
                          <strong>{winner}</strong>
                          {main.method ? ` (${formatFightMethod(main.method, locale)})` : ""}
                        </>
                      ) : main.status === "completed" ? (
                        `. ${formatWinnerlessFightResult(main.resultType, locale)}`
                      ) : null}
                    </p>
                  ) : null}
                </section>
              );
            })}
          </div>
          <Link href={localizePath("/results", locale)} className="event-table-link">
            {locale === "ru" ? "Все результаты UFC (ЮФС) →" : "All UFC results →"}
          </Link>
        </section>
      ) : null}
    </main>
  );
}
