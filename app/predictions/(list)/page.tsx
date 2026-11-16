import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { JsonLd } from "@/components/json-ld";
import { PageHero } from "@/components/page-hero";
import { TelegramPicksCta } from "@/components/telegram-picks-cta";
import { getPredictionAccuracy, getPredictionsPageData } from "@/lib/db";
import { isPickPending, pickPendingText } from "@/lib/event-picks";
import { PredictionStatsPanel } from "@/components/prediction-stats-panel";
import { tabEventLabel } from "@/lib/prediction-chart";
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
    fights: event.fights.filter((fight) => fight.predictionSnapshot && fight.slug?.trim())
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
  const dateLocale = locale === "ru" ? "ru-RU" : "en-US";
  // Главный бой турнира для русского названия на вкладке.
  const mainEventOf = (event: (typeof eventsWithSnapshots)[number]) => {
    const fight = event.fights.find((item) => item.isMainEvent) ?? event.fights[0];
    if (!fight) return null;
    const side = (fighter: { slug: string; name: string; nameRu: string | null }) => ({
      slug: fighter.slug,
      name: (locale === "ru" ? fighter.nameRu : null) ?? fighter.name
    });
    return { a: side(fight.fighterA), b: side(fight.fighterB) };
  };
  // Видимая строка под заголовком — коротко; подробный текст остаётся в description страницы.
  const heroLead =
    locale === "ru"
      ? nextEvent
        ? `Ближайший турнир — ${tabEventLabel(nextEvent.name, mainEventOf(nextEvent), locale)}, ${nextEventDate}. ${nextEventPicks > 0 ? `Пики модели готовы на ${nextEventPicks} из ${nextEvent.fights.length} боёв.` : "Пики модели на все бои появятся за 2–3 дня до турнира."}`
        : "Пики ИИ-модели FightBase на бои UFC появляются за 2–3 дня до турнира."
      : nextEvent
        ? `Next card: ${tabEventLabel(nextEvent.name, mainEventOf(nextEvent), locale)}, ${nextEventDate}. ${nextEventPicks > 0 ? `Model picks are ready for ${nextEventPicks} of ${nextEvent.fights.length} bouts.` : "Model picks are published 2–3 days before the event."}`
        : "FightBase AI picks for UFC fights are published 2–3 days before each event.";
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
        description={heroLead}
      />

      <PredictionStatsPanel locale={locale} accuracy={accuracy} sinceNote={sinceNote} />

      {eventsWithSnapshots.length > 0 ? (
        <nav className="ptabs" aria-label={locale === "ru" ? "Турниры" : "Events"}>
          {eventsWithSnapshots.map((event, index) => {
            const picksReady = event.fights.filter((fight) => fight.predictionSnapshot?.aiPickFighterId).length;
            const eventDate = new Date(event.date);
            return (
              <a href={`#predictions-${event.slug}`} className={`ptab${index === 0 ? " ptab--next" : ""}`} key={event.id}>
                <span className="ptab-date">
                  {new Intl.DateTimeFormat(dateLocale, { day: "numeric", timeZone: "UTC" }).format(eventDate)}
                  <small>{new Intl.DateTimeFormat(dateLocale, { month: "short", timeZone: "UTC" }).format(eventDate).replace(".", "")}</small>
                </span>
                <span className="ptab-copy">
                  {tabEventLabel(event.name, mainEventOf(event), locale)}
                  <small>
                    {locale === "ru" ? `Боёв: ${event.fights.length}` : `Bouts: ${event.fights.length}`}
                    {picksReady > 0
                      ? locale === "ru"
                        ? ` · пики готовы: ${picksReady}`
                        : ` · picks ready: ${picksReady}`
                      : locale === "ru"
                        ? " · пики за 2–3 дня"
                        : " · picks 2–3 days before"}
                  </small>
                </span>
              </a>
            );
          })}
        </nav>
      ) : null}

      <TelegramPicksCta locale={locale} className="ptg" />

      {eventsWithSnapshots.length === 0 ? (
        <section className="filter-empty-state">
          <h3>{locale === "ru" ? "Прогнозов пока нет" : "Prediction pages are not ready yet"}</h3>
          <p className="copy">
            {locale === "ru"
              ? "Прогнозы появятся здесь после ближайшего обновления коэффициентов."
              : "Ready-made UFC fight previews will appear here after the next scheduled odds and snapshot update."}
          </p>
        </section>
      ) : null}

      <section className="stack predictions-stack">
        {eventsWithSnapshots.map((event) => (
          <article key={event.id} id={`predictions-${event.slug}`} tabIndex={-1} className="table-card prediction-event-card prediction-event-card--featured">
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
                        {isPickPending(fight)
                          ? pickPendingText(locale, "short")
                          : locale === "ru" ? "Открыть превью боя" : "Open fight preview"}
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
