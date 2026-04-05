import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

export const revalidate = 3600;

import { Breadcrumbs } from "@/components/breadcrumbs";
import { JsonLd } from "@/components/json-ld";
import { PageHero } from "@/components/page-hero";
import { getEventPageData } from "@/lib/db";
import { formatFightMethod, formatFightStage, formatFightStatus, formatWeightClass } from "@/lib/display";
import { getLocale } from "@/lib/i18n";
import { buildLocaleAlternates, localizePath } from "@/lib/locale-path";
import { getSiteUrl } from "@/lib/site";

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const data = await getEventPageData(slug);

  if (!data) {
    return {
      title: locale === "ru" ? "Турнир не найден" : "Event not found"
    };
  }

  const { event } = data;
  const fightCount = event.fights.length;
  const description =
    locale === "ru"
      ? `${event.name}: турнир UFC, дата, место проведения, кард из ${fightCount} боев, прогнозы и связанные материалы FightBase Media.`
      : `${event.name}: UFC event page with date, venue, ${fightCount}-fight card, predictions, and related coverage from FightBase Media.`;

  return {
    title: locale === "ru" ? `${event.name}: кард турнира UFC, дата и прогнозы` : `${event.name}: UFC card, date, and predictions`,
    description,
    alternates: {
      ...buildLocaleAlternates(`/events/${event.slug}`),
      canonical: localizePath(`/events/${event.slug}`, locale)
    },
    openGraph: {
      type: "website",
      title: locale === "ru" ? `${event.name}: кард турнира UFC` : `${event.name}: UFC event page`,
      description,
      url: localizePath(`/events/${event.slug}`, locale)
    },
    twitter: {
      card: "summary",
      title: locale === "ru" ? `${event.name}: кард турнира UFC` : `${event.name}: UFC event page`,
      description
    }
  };
}

export default async function EventPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const locale = await getLocale();
  const data = await getEventPageData(slug);

  if (!data) {
    notFound();
  }

  const { event, relatedArticles } = data;
  const siteUrl = getSiteUrl().toString().replace(/\/$/, "");
  const eventUrl = `${siteUrl}${localizePath(`/events/${event.slug}`, locale)}`;
  const breadcrumbItems = [
    { label: locale === "ru" ? "Главная" : "Home", href: "/" },
    { label: locale === "ru" ? "Турниры" : "Events", href: "/events" },
    { label: event.name }
  ];
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbItems.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      item: item.href ? `${siteUrl}${localizePath(item.href, locale)}` : eventUrl
    }))
  };
  const eventJsonLd = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: event.name,
    description: event.summary,
    startDate: event.date.toISOString(),
    eventStatus:
      event.status === "completed"
        ? "https://schema.org/EventCompleted"
        : event.status === "live"
          ? "https://schema.org/EventInProgress"
          : "https://schema.org/EventScheduled",
    location: {
      "@type": "Place",
      name: event.venue,
      address: event.city
    },
    organizer: {
      "@type": "SportsOrganization",
      name: event.promotion.name
    },
    url: eventUrl,
    inLanguage: locale === "ru" ? "ru-RU" : "en-US"
  };

  return (
    <main className="container">
      <JsonLd data={breadcrumbJsonLd} />
      <JsonLd data={eventJsonLd} />
      <Breadcrumbs items={breadcrumbItems} locale={locale} />
      <PageHero
        eyebrow={event.promotion.shortName}
        title={event.name}
        description={`${event.promotion.shortName} · ${event.city} · ${event.venue} · ${event.summary}`}
      />

      <section className="detail-grid">
        <article className="table-card">
          <div className="event-detail-head">
            <div>
              <h3>{locale === "ru" ? "Кард турнира" : "Fight card"}</h3>
              <p className="copy">
                {locale === "ru"
                  ? "Готовая страница прогноза появляется после суточного обновления коэффициентов и snapshot-данных."
                  : "A dedicated prediction page appears after the daily odds and snapshot update."}
              </p>
            </div>
            <Link href={localizePath("/predictions", locale)} className="button-secondary">
              {locale === "ru" ? "Все прогнозы" : "All predictions"}
            </Link>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{locale === "ru" ? "Стадия" : "Stage"}</th>
                  <th>{locale === "ru" ? "Бой" : "Fight"}</th>
                  <th>{locale === "ru" ? "Вес" : "Weight"}</th>
                  <th>{locale === "ru" ? "Статус" : "Status"}</th>
                  <th>{event.status === "completed"
                    ? (locale === "ru" ? "Результат" : "Result")
                    : (locale === "ru" ? "Прогноз" : "Prediction")}</th>
                </tr>
              </thead>
              <tbody>
                {event.fights.map((fight) => (
                  <tr key={fight.id}>
                    <td>{formatFightStage(fight.stage, locale)}</td>
                    <td>
                      <Link href={localizePath(`/fighters/${fight.fighterA.slug}`, locale)}>
                        {locale === "ru" ? fight.fighterA.nameRu ?? fight.fighterA.name : fight.fighterA.name}
                      </Link>{" "}
                      vs{" "}
                      <Link href={localizePath(`/fighters/${fight.fighterB.slug}`, locale)}>
                        {locale === "ru" ? fight.fighterB.nameRu ?? fight.fighterB.name : fight.fighterB.name}
                      </Link>
                    </td>
                    <td>{formatWeightClass(fight.weightClass, locale)}</td>
                    <td>{formatFightStatus(fight.status, locale)}</td>
                    <td>
                      {fight.status === "completed" && fight.winnerFighterId ? (
                        <span className="event-table-result">
                          <strong>
                            {fight.winnerFighterId === fight.fighterAId
                              ? (locale === "ru" ? fight.fighterA.nameRu ?? fight.fighterA.name : fight.fighterA.name)
                              : (locale === "ru" ? fight.fighterB.nameRu ?? fight.fighterB.name : fight.fighterB.name)}
                          </strong>
                          {fight.method ? ` — ${formatFightMethod(fight.method, locale)}` : ""}
                          {fight.resultRound ? `, R${fight.resultRound}` : ""}
                          {fight.resultTime ? ` ${fight.resultTime}` : ""}
                        </span>
                      ) : fight.status === "completed" ? (
                        <span className="event-table-result">
                          {locale === "ru" ? "Ничья / NC" : "Draw / NC"}
                        </span>
                      ) : fight.predictionSnapshot ? (
                        <Link href={localizePath(`/predictions/${event.slug}/${fight.slug}`, locale)} className="event-table-link">
                          {locale === "ru" ? "Открыть прогноз" : "Open prediction"}
                        </Link>
                      ) : (
                        <span className="event-table-pending">{locale === "ru" ? "Прогноз ожидается" : "Prediction pending"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <aside className="stack">
          <div className="policy-card">
            <h3>{locale === "ru" ? "Фокус на главных матчапах" : "Focus on the key matchups"}</h3>
            <p className="copy">
              {locale === "ru"
                ? "На странице турнира собран весь основной контекст: кард, готовые прогнозы и материалы, которые помогают быстро оценить важнейшие бои вечера."
                : "The event page gathers the practical context that matters most: fight card, prediction pages, and coverage around the key matchups."}
            </p>
          </div>
          <div className="policy-card">
            <h3>{locale === "ru" ? "Быстрые переходы к прогнозам" : "Quick prediction links"}</h3>
            <ul className="event-side-list">
              {event.fights
                .filter((fight) => fight.predictionSnapshot)
                .slice(0, 6)
                .map((fight) => (
                  <li key={fight.id}>
                    <Link href={localizePath(`/predictions/${event.slug}/${fight.slug}`, locale)}>
                      {locale === "ru" ? fight.fighterA.nameRu ?? fight.fighterA.name : fight.fighterA.name} vs{" "}
                      {locale === "ru" ? fight.fighterB.nameRu ?? fight.fighterB.name : fight.fighterB.name}
                    </Link>
                  </li>
                ))}
            </ul>
          </div>
          <div className="policy-card">
            <h3>{locale === "ru" ? "Связанные материалы" : "Related coverage"}</h3>
            <ul className="event-side-list">
              {relatedArticles.map((article) => (
                <li key={article.id}>
                  <Link href={localizePath(`/news/${article.slug}`, locale)}>{article.title}</Link>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </section>
    </main>
  );
}
