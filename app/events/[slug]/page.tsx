import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { JsonLd } from "@/components/json-ld";
import { PageHero } from "@/components/page-hero";
import { getEventPageData } from "@/lib/db";
import { formatFightStage, formatFightStatus, formatWeightClass } from "@/lib/display";
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
  const description = `${event.promotion.shortName} · ${event.city} · ${event.venue} · ${event.summary}`;

  return {
    title: event.name,
    description,
    alternates: {
      ...buildLocaleAlternates(`/events/${event.slug}`),
      canonical: localizePath(`/events/${event.slug}`, locale)
    },
    openGraph: {
      type: "website",
      title: event.name,
      description,
      url: localizePath(`/events/${event.slug}`, locale)
    },
    twitter: {
      card: "summary",
      title: event.name,
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
    url: eventUrl
  };

  return (
    <main className="container">
      <JsonLd data={breadcrumbJsonLd} />
      <JsonLd data={eventJsonLd} />
      <Breadcrumbs items={breadcrumbItems} locale={locale} />
      <PageHero
        eyebrow={`/events/${event.slug}`}
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
                  ? "У каждого боя теперь есть отдельная страница прогноза с раскладом по матчапу."
                  : "Every matchup now has a dedicated prediction page with a focused preview."}
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
                  <th>{locale === "ru" ? "Прогноз" : "Prediction"}</th>
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
                      <Link href={localizePath(`/predictions/${event.slug}/${fight.id}`, locale)} className="event-table-link">
                        {locale === "ru" ? "Открыть прогноз" : "Open prediction"}
                      </Link>
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
                ? "Вместо пустых заглушек здесь теперь логика просмотра карда: кто задаёт темп, где стилистический конфликт и какие бои важнее всего для дивизиона."
                : "This sidebar now pushes the practical watchpoints: pace-setters, style clashes, and the fights that matter most for the division."}
            </p>
          </div>
          <div className="policy-card">
            <h3>{locale === "ru" ? "Быстрые переходы к прогнозам" : "Quick prediction links"}</h3>
            <ul className="event-side-list">
              {event.fights.slice(0, 6).map((fight) => (
                <li key={fight.id}>
                  <Link href={localizePath(`/predictions/${event.slug}/${fight.id}`, locale)}>
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
