import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { JsonLd } from "@/components/json-ld";
import { PageHero } from "@/components/page-hero";
import { getPredictionAccuracy, getPredictionsPageData } from "@/lib/db";
import { formatUnits } from "@/lib/prediction-roi";
import { formatEventLocation, formatWeightClass, getDisplayName } from "@/lib/display";
import { getLocale } from "@/lib/i18n";
import { getDisplayImageUrl } from "@/lib/image-proxy";
import { localizePath } from "@/lib/locale-path";
import { getPredictionStatsSince, predictionStatsSinceNote } from "@/lib/prediction-stats-window";
import { buildPageMetadata } from "@/lib/page-metadata";
import { getSiteUrl } from "@/lib/site";
import { buildTrailBreadcrumbJsonLd } from "@/lib/structured-data";

export const revalidate = 86400;


function hasUsablePhoto(url?: string | null) {
  return (
    Boolean(url) &&
    !/silhouette|logo_of_the_ultimate_fighting_championship|flag_of_|\/themes\/custom\/ufc\/assets\/img\//i.test(
      String(url)
    )
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();

  return buildPageMetadata({
    locale,
    path: "/predictions",
    title: locale === "ru" ? "Прогнозы на бои UFC: ближайшие турниры, пики и точность" : "UFC fight predictions: upcoming cards, picks and accuracy",
    description:
      locale === "ru"
        ? "Прогнозы на бои UFC (ЮФС) на сегодня и ближайшие турниры: пик ИИ-модели FightBase и проценты по каждому бою, разбор матчапа, открытая история точности."
        : "UFC fight predictions for today and upcoming cards: FightBase AI pick and percentages for every bout, matchup breakdowns, open accuracy history."
  });
}

export default async function PredictionsPage() {
  const locale = await getLocale();
  const [events, accuracy] = await Promise.all([getPredictionsPageData(), getPredictionAccuracy()]);
  const sinceNote = predictionStatsSinceNote(getPredictionStatsSince(), locale);
  const siteUrl = getSiteUrl();
  const collectionUrl = new URL(localizePath("/predictions", locale), siteUrl).toString();
  const eventsWithSnapshots = events.map((event) => ({
    ...event,
    fights: event.fights.filter((fight) => fight.predictionSnapshot)
  })).filter((event) => event.fights.length > 0);
  const breadcrumbItems = [
    { label: locale === "ru" ? "Главная" : "Home", href: "/" },
    { label: locale === "ru" ? "Прогнозы" : "Predictions" }
  ];
  // Ближайший турнир с пиками — то, что ищут по «прогнозы на UFC сегодня».
  const nextEvent = eventsWithSnapshots[0] ?? null;
  const nextEventDate = nextEvent
    ? new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(nextEvent.date))
    : null;
  const nextEventPicks = nextEvent ? nextEvent.fights.filter((fight) => fight.predictionSnapshot?.aiPickFighterId).length : 0;
  const totalPicks = eventsWithSnapshots.reduce((sum, event) => sum + event.fights.length, 0);
  const heroDescription =
    locale === "ru"
      ? nextEvent
        ? `Прогнозы ИИ-модели FightBase на бои UFC (ЮФС): ближайший турнир ${nextEvent.name} ${nextEventDate}, пики готовы на ${nextEventPicks} из ${nextEvent.fights.length} боёв. Всего ${totalPicks} прогнозов на ${eventsWithSnapshots.length} ближайших турниров: пик, проценты и разбор по каждому матчапу.`
        : "Прогнозы ИИ-модели FightBase на бои UFC (ЮФС): пик, проценты и разбор по каждому матчапу ближайших турниров."
      : nextEvent
        ? `FightBase AI predictions for UFC fights: next card ${nextEvent.name} on ${nextEventDate}, picks ready for ${nextEventPicks} of ${nextEvent.fights.length} bouts. ${totalPicks} predictions across the next ${eventsWithSnapshots.length} events with pick, percentages and a breakdown for every matchup.`
        : "FightBase AI predictions for UFC fights: pick, percentages and a breakdown for every matchup on upcoming cards.";
  const itemList = eventsWithSnapshots
    .flatMap((event) =>
      event.fights.map((fight) => ({
        fight,
        eventSlug: event.slug
      }))
    )
    .map(({ fight, eventSlug }, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: new URL(localizePath(`/predictions/${eventSlug}/${fight.slug}`, locale), siteUrl).toString(),
      name: `${getDisplayName(fight.fighterA, locale)} vs ${getDisplayName(fight.fighterB, locale)}`
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
          name: locale === "ru" ? "Прогнозы UFC" : "UFC predictions",
          url: collectionUrl
        }}
      />
      {itemList.length > 0 ? (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: locale === "ru" ? "Лента прогнозов UFC" : "UFC prediction desk",
            itemListElement: itemList
          }}
        />
      ) : null}

      <Breadcrumbs items={breadcrumbItems} locale={locale} />
      <PageHero
        eyebrow="/predictions"
        title={locale === "ru" ? "Прогнозы на бои UFC" : "UFC fight predictions"}
        description={heroDescription}
      />

      {accuracy.favorite.percent !== null || accuracy.model.percent !== null ? (
        <section className="policy-card" aria-label={locale === "ru" ? "Как отрабатывают прогнозы" : "Prediction track record"}>
          <p className="kicker">{locale === "ru" ? "Как отрабатывают прогнозы" : "Prediction track record"}</p>
          {accuracy.model.percent !== null ? (
            <p className="copy">
              {locale === "ru"
                ? `Прогноз FightBase угадал победителя в ${accuracy.model.correct} из ${accuracy.model.judged} боёв (${accuracy.model.percent}%) на последних ${accuracy.eventsCount} турнирах.`
                : `The FightBase pick called ${accuracy.model.correct} of ${accuracy.model.judged} bouts (${accuracy.model.percent}%) across the last ${accuracy.eventsCount} events.`}
            </p>
          ) : null}
          {accuracy.favorite.percent !== null ? (
            <p className="copy">
              {locale === "ru"
                ? `Для сравнения: фаворит по предматчевой оценке побеждал в ${accuracy.favorite.correct} из ${accuracy.favorite.judged} боёв (${accuracy.favorite.percent}%). Итог каждого боя — на его странице прогноза.`
                : `For reference, the pre-fight favorite won ${accuracy.favorite.correct} of ${accuracy.favorite.judged} bouts (${accuracy.favorite.percent}%). Each fight page shows its result.`}
            </p>
          ) : null}
          {accuracy.modelRoi.percent !== null ? (
            <p className="copy">
              {locale === "ru"
                ? `Виртуальный банкролл (1 у.е. на прогноз, по кэфам на момент публикации): ${formatUnits(accuracy.modelRoi.units, "ru")} на ${accuracy.modelRoi.staked} прогнозах, ROI ${accuracy.modelRoi.percent > 0 ? "+" : ""}${accuracy.modelRoi.percent}% · стратегия «всегда фаворит»: ${accuracy.favoriteRoi.percent === null ? "—" : `${accuracy.favoriteRoi.percent > 0 ? "+" : ""}${accuracy.favoriteRoi.percent}%`}.`
                : `Virtual bankroll (1 unit per pick at publication-time odds): ${formatUnits(accuracy.modelRoi.units, "en")} across ${accuracy.modelRoi.staked} picks, ROI ${accuracy.modelRoi.percent > 0 ? "+" : ""}${accuracy.modelRoi.percent}% · "always the favorite": ${accuracy.favoriteRoi.percent === null ? "—" : `${accuracy.favoriteRoi.percent > 0 ? "+" : ""}${accuracy.favoriteRoi.percent}%`}.`}
            </p>
          ) : null}
          {sinceNote ? <p className="copy">{sinceNote}</p> : null}
          <p className="copy">
            <Link href={localizePath("/predictions/accuracy", locale)}>
              {locale === "ru" ? "Полная история точности по турнирам →" : "Full accuracy history by event →"}
            </Link>
          </p>
        </section>
      ) : null}

      {eventsWithSnapshots.length === 0 ? (
        <section className="filter-empty-state">
          <h3>{locale === "ru" ? "Прогнозные страницы пока не готовы" : "Prediction pages are not ready yet"}</h3>
          <p className="copy">
            {locale === "ru"
              ? "После ближайшего суточного обновления коэффициентов и snapshot-данных здесь появятся готовые превью боев UFC."
              : "Ready-made UFC fight previews will appear here after the next scheduled odds and snapshot update."}
          </p>
        </section>
      ) : null}

      <section className="stack predictions-stack">
        {eventsWithSnapshots.map((event) => (
          <article key={event.id} className="table-card prediction-event-card prediction-event-card--featured">
            <div className="prediction-event-head">
              <div>
                <p className="kicker">
                  {[
                    event.promotion.shortName,
                    new Date(event.date).toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US"),
                    formatEventLocation(event.city, null, locale)
                  ]
                    .map((part) => String(part || "").trim())
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <h3>{event.name}</h3>
              </div>
              <Link href={localizePath(`/events/${event.slug}`, locale)} className="button-secondary">
                {locale === "ru" ? "Страница турнира" : "Event page"}
              </Link>
            </div>

            <div className="prediction-match-grid">
              {event.fights.map((fight) => {
                const fighterAName = getDisplayName(fight.fighterA, locale);
                const fighterBName = getDisplayName(fight.fighterB, locale);
                const snapshot = fight.predictionSnapshot;
                const hasSnapshot = Boolean(snapshot);
                const percentA = snapshot?.percentA ?? 0;
                const percentB = snapshot?.percentB ?? 0;

                const cardInner = (
                  <>
                    <div className="prediction-match-visual">
                      {hasUsablePhoto(fight.fighterA.photoUrl) ? (
                        <Image
                          src={getDisplayImageUrl(String(fight.fighterA.photoUrl))}
                          alt={fighterAName}
                          className="prediction-match-photo"
                          width={50}
                          height={72}
                        />
                      ) : (
                        <div className="prediction-match-photo prediction-match-photo--placeholder">{fighterAName.charAt(0)}</div>
                      )}
                      {hasUsablePhoto(fight.fighterB.photoUrl) ? (
                        <Image
                          src={getDisplayImageUrl(String(fight.fighterB.photoUrl))}
                          alt={fighterBName}
                          className="prediction-match-photo"
                          width={50}
                          height={72}
                        />
                      ) : (
                        <div className="prediction-match-photo prediction-match-photo--placeholder">{fighterBName.charAt(0)}</div>
                      )}
                    </div>
                    <div className="prediction-match-copy">
                      <strong>
                        {fighterAName} vs {fighterBName}
                      </strong>
                      <span>{formatWeightClass(fight.weightClass, locale)}</span>
                      <small>
                        {hasSnapshot
                          ? locale === "ru" ? "Открыть превью боя" : "Open fight preview"
                          : locale === "ru" ? "Прогноз ожидается" : "Prediction pending"}
                      </small>
                    </div>
                    {hasSnapshot ? (
                      <div className="prediction-match-meter">
                        <div className="prediction-meter">
                          <div className="prediction-meter-fill" style={{ width: `${percentA}%` }} />
                        </div>
                        <div className="prediction-meter-scale">
                          <span>{percentA}%</span>
                          <span className="prediction-meter-source">{locale === "ru" ? "прогноз" : "preview"}</span>
                          <span>{percentB}%</span>
                        </div>
                      </div>
                    ) : null}
                  </>
                );

                return hasSnapshot ? (
                  <Link
                    key={fight.id}
                    href={localizePath(`/predictions/${event.slug}/${fight.slug}`, locale)}
                    className="prediction-match-card prediction-match-card--visual"
                  >
                    {cardInner}
                  </Link>
                ) : (
                  <div key={fight.id} className="prediction-match-card prediction-match-card--visual prediction-match-card--pending">
                    {cardInner}
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
