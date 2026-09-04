import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

export const revalidate = 3600;

import { Breadcrumbs } from "@/components/breadcrumbs";
import { JsonLd } from "@/components/json-ld";
import { PageHero } from "@/components/page-hero";
import { getArticleHref } from "@/lib/article-routes";
import { buildPairSlug } from "@/lib/compare-pairs";
import { getEventPageData } from "@/lib/db";
import { formatCardNightLabel, formatCardTime, hasCardTimes } from "@/lib/event-time";
import { formatEventLocation, formatFightMethod, formatFightStage, formatFightStatus, formatWeightClass, getDisplayName, isUsablePhoto } from "@/lib/display";
import { formatWinnerlessFightResult, sortFightsForCard } from "@/lib/fight-card";
import { getLocale } from "@/lib/i18n";
import { buildLocaleAlternates, localizePath } from "@/lib/locale-path";
import { ogImageUrl } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site";
import { buildTrailBreadcrumbJsonLd, buildSportsEventJsonLd, toAbsoluteUrl } from "@/lib/structured-data";

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const data = await getEventPageData(slug);

  if (!data) {
    // Real HTTP 404: metadata resolves before the streamed shell commits a 200.
    notFound();
  }

  const { event } = data;
  const orderedFights = sortFightsForCard(event.fights);
  const fightCount = orderedFights.length;
  const isCompleted = event.status === "completed";
  const startLine =
    !isCompleted && event.mainCardAt
      ? locale === "ru"
        ? ` Главный кард — ${formatCardNightLabel(event.mainCardAt, "ru")}, в ${formatCardTime(event.mainCardAt, "ru")} мск.`
        : ` Main card starts ${formatCardNightLabel(event.mainCardAt, "en")} at ${formatCardTime(event.mainCardAt, "en")} UTC.`
      : "";
  const description =
    locale === "ru"
      ? `${event.name}: турнир UFC, дата, место проведения, кард из ${fightCount} боев, прогнозы и связанные материалы FightBase Media.${startLine}`
      : `${event.name}: UFC event page with date, venue, ${fightCount}-fight card, predictions, and related coverage from FightBase Media.${startLine}`;

  const title = isCompleted
    ? locale === "ru"
      ? `${event.name} — результаты и кард турнира`
      : `${event.name} — results and card`
    : locale === "ru"
      ? `${event.name} — дата, время по Москве и кард`
      : `${event.name} — date, start time, and card`;
  const ogTitle = locale === "ru" ? `${event.name}: кард турнира UFC` : `${event.name}: UFC event page`;
  const leadPhoto = orderedFights[0]?.fighterA?.photoUrl ?? orderedFights[0]?.fighterB?.photoUrl;
  const ogImage = ogImageUrl(leadPhoto);

  return {
    title,
    description,
    alternates: {
      ...buildLocaleAlternates(`/events/${event.slug}`),
      canonical: localizePath(`/events/${event.slug}`, locale)
    },
    openGraph: {
      type: "website",
      title: ogTitle,
      description,
      url: localizePath(`/events/${event.slug}`, locale),
      images: [ogImage]
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description,
      images: [ogImage]
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
  const orderedFights = sortFightsForCard(event.fights);
  const siteUrl = getSiteUrl().toString().replace(/\/$/, "");
  const eventUrl = `${siteUrl}${localizePath(`/events/${event.slug}`, locale)}`;
  const breadcrumbItems = [
    { label: locale === "ru" ? "Главная" : "Home", href: "/" },
    { label: locale === "ru" ? "Турниры" : "Events", href: "/events" },
    { label: event.name }
  ];
  const breadcrumbJsonLd = buildTrailBreadcrumbJsonLd(breadcrumbItems, { locale, siteUrl, currentUrl: eventUrl });
  const seenFighterIds = new Set<string>();
  const performers = orderedFights
    .flatMap((fight) => [fight.fighterA, fight.fighterB])
    .filter((fighter) => {
      if (!fighter || seenFighterIds.has(fighter.id)) return false;
      seenFighterIds.add(fighter.id);
      return true;
    })
    .map((fighter) => ({
      name: getDisplayName(fighter, locale),
      url: `${siteUrl}${localizePath(`/fighters/${fighter.slug}`, locale)}`
    }));
  const leadFight = orderedFights[0];
  const cardImages = [leadFight?.fighterA?.photoUrl, leadFight?.fighterB?.photoUrl]
    .filter((url): url is string => isUsablePhoto(url))
    .map((url) => toAbsoluteUrl(url, siteUrl));
  const eventImages = cardImages.length > 0 ? cardImages : [`${siteUrl}/gorilla-crown-logo.png`];
  const eventJsonLd = buildSportsEventJsonLd({
    name: event.name,
    description: event.summary,
    url: eventUrl,
    inLanguage: locale === "ru" ? "ru-RU" : "en-US",
    date: event.earlyPrelimsAt ?? event.prelimsAt ?? event.mainCardAt ?? event.date,
    venue: event.venue,
    city: event.city,
    status: event.status,
    promotionName: event.promotion.name,
    siteOrigin: siteUrl,
    performers,
    images: eventImages
  });

  return (
    <main className="container">
      <JsonLd data={breadcrumbJsonLd} />
      {eventJsonLd && <JsonLd data={eventJsonLd} />}
      <Breadcrumbs items={breadcrumbItems} locale={locale} />
      <PageHero
        eyebrow={event.promotion.shortName}
        title={event.name}
        description={[
          event.promotion.shortName,
          formatEventLocation(event.city, event.venue, locale),
          (event.summary || "").replace(/\.\.+$/, ".")
        ]
          .map((part) => String(part || "").trim())
          .filter(Boolean)
          .join(" · ")}
      />

      {event.status !== "completed" && hasCardTimes(event) ? (
        <section className="policy-card" aria-label={locale === "ru" ? "Во сколько начнётся" : "Start times"}>
          <p className="kicker">{locale === "ru" ? "Во сколько начнётся" : "Start times"}</p>
          <p className="copy">
            {(() => {
              const anchor = event.mainCardAt ?? event.prelimsAt ?? event.earlyPrelimsAt;
              const nightLabel = anchor ? formatCardNightLabel(anchor, locale) : "";
              const capitalized = nightLabel ? nightLabel.charAt(0).toUpperCase() + nightLabel.slice(1) : "";
              return locale === "ru" ? `${capitalized}, время московское.` : `${capitalized}, times in UTC.`;
            })()}
          </p>
          <p className="copy">
            {[
              event.earlyPrelimsAt
                ? `${locale === "ru" ? "Ранние прелимы" : "Early prelims"} — ${formatCardTime(event.earlyPrelimsAt, locale)}`
                : null,
              event.prelimsAt
                ? `${locale === "ru" ? "Прелимы" : "Prelims"} — ${formatCardTime(event.prelimsAt, locale)}`
                : null,
              event.mainCardAt
                ? `${locale === "ru" ? "Главный кард" : "Main card"} — ${formatCardTime(event.mainCardAt, locale)}`
                : null
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="copy">
            {locale === "ru"
              ? "Время начала может сдвигаться в зависимости от продолжительности предыдущих боёв."
              : "Start times can shift depending on how long earlier fights run."}
          </p>
        </section>
      ) : null}

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
              <caption className="sr-only">
                {locale === "ru" ? `Кард турнира ${event.name}` : `${event.name} fight card`}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{locale === "ru" ? "Стадия" : "Stage"}</th>
                  <th scope="col">{locale === "ru" ? "Бой" : "Fight"}</th>
                  <th scope="col">{locale === "ru" ? "Вес" : "Weight"}</th>
                  <th scope="col">{locale === "ru" ? "Статус" : "Status"}</th>
                  <th scope="col">{event.status === "completed"
                    ? (locale === "ru" ? "Результат" : "Result")
                    : (locale === "ru" ? "Прогноз" : "Prediction")}</th>
                </tr>
              </thead>
              <tbody>
                {orderedFights.map((fight) => (
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
                          {formatWinnerlessFightResult(fight.resultType, locale)}
                        </span>
                      ) : fight.predictionSnapshot ? (
                        <Link href={localizePath(`/predictions/${event.slug}/${fight.slug}`, locale)} className="event-table-link">
                          {locale === "ru" ? "Открыть прогноз" : "Open prediction"}
                        </Link>
                      ) : (
                        <span className="event-table-pending">{locale === "ru" ? "Прогноз ожидается" : "Prediction pending"}</span>
                      )}
                      <Link
                        href={localizePath(
                          `/compare/${buildPairSlug(fight.fighterA.slug, fight.fighterB.slug)}`,
                          locale
                        )}
                        className="event-table-link compare-inline-link"
                      >
                        {locale === "ru" ? "Сравнить бойцов" : "Compare fighters"}
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
                ? "На странице турнира собран весь основной контекст: кард, готовые прогнозы и материалы, которые помогают быстро оценить важнейшие бои вечера."
                : "The event page gathers the practical context that matters most: fight card, prediction pages, and coverage around the key matchups."}
            </p>
          </div>
          <div className="policy-card">
            <h3>{locale === "ru" ? "Быстрые переходы к прогнозам" : "Quick prediction links"}</h3>
            <ul className="event-side-list">
              {orderedFights
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
                  <Link href={localizePath(getArticleHref(article.category, article.slug), locale)}>
                    {article.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </section>
    </main>
  );
}
