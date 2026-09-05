
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const revalidate = 1800;

import { ArticleCard } from "@/components/cards";
import { getArticleHref } from "@/lib/article-routes";
import { JsonLd } from "@/components/json-ld";
import { MetrikaGoalLink } from "@/components/metrika-goal-link";
import { PushSubscribeButton } from "@/components/push-subscribe-button";
import {
  getEventNightEvent,
  getHomePageData,
  getPredictionAccuracy,
  getUfcOfficialRankingLinks,
  getUfcRankingSnapshot
} from "@/lib/db";
import { formatCardTime } from "@/lib/event-time";
import { formatEventLocation, formatWeightClass, getDisplayName, isUsablePhoto } from "@/lib/display";
import { getDisplayImageUrl } from "@/lib/image-proxy";
import { getLocale } from "@/lib/i18n";
import { buildLocaleAlternates, localizePath } from "@/lib/locale-path";
import { getPredictionStatsSince, predictionStatsSinceNote } from "@/lib/prediction-stats-window";
import { ogImageUrl } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site";
import { isPoundForPoundRankingGroup } from "@/lib/ufc-rankings";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const isRu = locale === "ru";
  const title = isRu
    ? "FightBase Media - новости UFC, прогнозы, бойцы и турниры"
    : "FightBase Media - UFC news, predictions, fighters, and events";
  const description = isRu
    ? "FightBase Media освещает UFC как профильное спортивное медиа: новости, карточки турниров, прогнозы на бои, профили бойцов и рейтинги."
    : "FightBase Media covers UFC as a specialist sports publication with news, event pages, fight predictions, fighter profiles, and rankings.";

  return {
    title: { absolute: title },
    description,
    alternates: {
      ...buildLocaleAlternates("/"),
      canonical: localizePath("/", locale)
    },
    openGraph: {
      type: "website",
      title,
      description,
      url: localizePath("/", locale),
      images: [ogImageUrl()]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl()]
    }
  };
}

type RailFighter = { id: string; name: string; nameRu: string | null };

function pickFor(fight: {
  fighterA: RailFighter;
  fighterB: RailFighter;
  predictionSnapshot: { percentA: number; percentB: number; aiPickFighterId: string | null } | null;
}) {
  const snapshot = fight.predictionSnapshot;
  if (!snapshot?.aiPickFighterId) {
    return null;
  }
  const pickIsA = snapshot.aiPickFighterId === fight.fighterA.id;
  const pickIsB = snapshot.aiPickFighterId === fight.fighterB.id;
  if (!pickIsA && !pickIsB) {
    return null;
  }
  const fighter = pickIsA ? fight.fighterA : fight.fighterB;
  const percent = pickIsA ? snapshot.percentA : snapshot.percentB;
  const favoriteIsA = snapshot.percentA >= snapshot.percentB;
  return { fighter, percent, underdog: pickIsA !== favoriteIsA };
}

export default async function HomePage() {
  const locale = await getLocale();
  const isRu = locale === "ru";
  const [{ articles, events, leadEventFights }, eventNight, accuracy, rankingSnapshot, rankingLinks] = await Promise.all([
    getHomePageData(),
    getEventNightEvent(),
    getPredictionAccuracy(),
    getUfcRankingSnapshot(),
    getUfcOfficialRankingLinks()
  ]);
  const leadEvent = events[0];
  const leadFight = leadEventFights[0];
  const leadPick = leadFight ? pickFor(leadFight) : null;
  // Пики на кард: только бои со снапшотом, главный бой уже показан на постере.
  const railFights = leadEventFights.filter((fight) => fight.predictionSnapshot).slice(0, 6);
  const upcomingEvents = events.slice(0, 4);
  const sinceNote = predictionStatsSinceNote(getPredictionStatsSince(), locale);

  const p4pGroup = (rankingSnapshot?.groups ?? []).find((group) => isPoundForPoundRankingGroup(group.title));
  // В P4P-группе UFC.com ставит первого номера в слот чемпиона и повторяет его
  // первой строкой, поэтому берём только строки, без «чемпиона».
  const p4pRows = p4pGroup
    ? p4pGroup.rows
        .filter((row) => row.name)
        .slice(0, 3)
        .map((row) => {
          const link =
            (row.officialSlug ? rankingLinks.bySlug.get(row.officialSlug.toLowerCase()) : null) ??
            rankingLinks.byName.get(row.name.toLowerCase()) ??
            null;
          return {
            rank: row.rank,
            name: (isRu ? link?.nameRu : null) ?? row.name,
            slug: link?.localSlug ?? null
          };
        })
    : [];

  const telegramUrl = process.env.NEXT_PUBLIC_TELEGRAM_URL?.trim() || "";
  const vkUrl = process.env.NEXT_PUBLIC_VK_URL?.trim() || "";
  const hasTelegram = Boolean(telegramUrl) && telegramUrl !== "https://t.me/" && telegramUrl !== "https://t.me";
  const hasVk = Boolean(vkUrl) && vkUrl !== "https://vk.com/" && vkUrl !== "https://vk.com";

  const siteUrl = getSiteUrl();
  const pageUrl = new URL(localizePath("/", locale), siteUrl).toString();
  const dateLocale = isRu ? "ru-RU" : "en-US";
  const formatShortDate = (date: Date) =>
    new Intl.DateTimeFormat(dateLocale, { day: "numeric", month: "long", timeZone: "Europe/Moscow" }).format(date);
  const formatDayMonth = (date: Date) =>
    new Intl.DateTimeFormat(dateLocale, { day: "2-digit", month: "2-digit", timeZone: "Europe/Moscow" }).format(date);
  const itemListElements = [
    ...articles.slice(0, 4).map((article, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: new URL(localizePath(getArticleHref(article.category, article.slug), locale), siteUrl).toString(),
      name: article.title
    })),
    ...events.slice(0, 4).map((event, index) => ({
      "@type": "ListItem",
      position: articles.slice(0, 4).length + index + 1,
      url: new URL(localizePath(`/events/${event.slug}`, locale), siteUrl).toString(),
      name: event.name
    }))
  ];

  return (
    <main>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "FightBase Media - UFC",
          url: pageUrl,
          inLanguage: isRu ? "ru-RU" : "en-US",
          description: isRu
            ? "Главная страница FightBase Media с новостями UFC, турнирами, прогнозами и профилями бойцов."
            : "FightBase Media homepage with UFC news, event coverage, predictions, and fighter profiles."
        }}
      />
      {itemListElements.length > 0 ? (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: isRu ? "Ключевые материалы FightBase Media" : "FightBase Media featured content",
            itemListElement: itemListElements
          }}
        />
      ) : null}

      {eventNight ? (
        <Link
          href={localizePath(`/events/${eventNight.slug}`, locale)}
          className="event-night-banner"
          aria-label={isRu ? "Турнирная ночь" : "Fight night"}
        >
          <span className="event-night-banner-dot" aria-hidden="true" />
          <span>
            {isRu
              ? `Турнирная ночь: ${eventNight.name} — кард, прогнозы и результаты по ходу турнира`
              : `Fight night: ${eventNight.name} — card, picks, and live results`}
            {eventNight.mainCardAt
              ? isRu
                ? ` · главный кард в ${formatCardTime(eventNight.mainCardAt, "ru")} мск`
                : ` · main card at ${formatCardTime(eventNight.mainCardAt, "en")} UTC`
              : ""}
          </span>
        </Link>
      ) : null}

      <section className="hero-section">
        <div className="container hero-grid hero-grid-poster">
          <article className="hero-card editorial-hero-card hero-card-poster">
            <div className="hero-poster-topline">
              <span>{isRu ? "Главный бой недели" : "Fight of the week"}</span>
              <span>FightBase Media</span>
            </div>

            <div className="hero-poster-body">
              <p className="eyebrow">{leadEvent ? leadEvent.name : "FightBase Media"}</p>

              <h1>
                {leadFight
                  ? `${getDisplayName(leadFight.fighterA, locale)} vs ${getDisplayName(leadFight.fighterB, locale)}`
                  : isRu
                    ? "Новости, прогнозы и бойцы UFC"
                    : "UFC news, predictions, and fighters"}
              </h1>

              <div className="hero-poster-subline">
                {leadEvent && leadFight ? (
                  <>
                    <span>{leadEvent.promotion?.shortName ?? "UFC"}</span>
                    <span>{new Date(leadEvent.date).toLocaleDateString(dateLocale)}</span>
                    <span>{formatEventLocation(leadEvent.city, leadEvent.venue, locale)}</span>
                    <span>{formatWeightClass(leadFight.weightClass, locale)}</span>
                  </>
                ) : (
                  <>
                    <span>FightBase Media</span>
                    <span>{isRu ? "Новости, аналитика, прогнозы" : "News, analysis, predictions"}</span>
                  </>
                )}
              </div>

              {leadFight ? (
                <div className="hero-fight-tape">
                  <div className="hero-fight-corner">
                    {isUsablePhoto(leadFight.fighterA.photoUrl) ? (
                      <Image
                        src={getDisplayImageUrl(String(leadFight.fighterA.photoUrl))}
                        alt={getDisplayName(leadFight.fighterA, locale)}
                        className="hero-corner-photo"
                        width={180}
                        height={220}
                        sizes="(max-width: 720px) 40vw, 180px"
                        priority
                      />
                    ) : null}
                    <span>{isRu ? "Красный угол" : "Red corner"}</span>
                    <strong>{getDisplayName(leadFight.fighterA, locale)}</strong>
                    {leadFight.fighterA.record ? <span>{leadFight.fighterA.record}</span> : null}
                  </div>
                  <div className="hero-fight-divider">VS</div>
                  <div className="hero-fight-corner hero-fight-corner--right">
                    {isUsablePhoto(leadFight.fighterB.photoUrl) ? (
                      <Image
                        src={getDisplayImageUrl(String(leadFight.fighterB.photoUrl))}
                        alt={getDisplayName(leadFight.fighterB, locale)}
                        className="hero-corner-photo hero-corner-photo--right"
                        width={180}
                        height={220}
                        sizes="(max-width: 720px) 40vw, 180px"
                        priority
                      />
                    ) : null}
                    <span>{isRu ? "Синий угол" : "Blue corner"}</span>
                    <strong>{getDisplayName(leadFight.fighterB, locale)}</strong>
                    {leadFight.fighterB.record ? <span>{leadFight.fighterB.record}</span> : null}
                  </div>
                </div>
              ) : null}

              {leadFight && leadPick ? (
                <div className="hero-verdict">
                  <p className="eyebrow">{isRu ? "Пик ИИ-модели FightBase" : "FightBase AI pick"}</p>
                  <strong>{getDisplayName(leadPick.fighter, locale)}</strong>
                  <span>
                    {isRu
                      ? `${leadFight.predictionSnapshot?.percentA}% против ${leadFight.predictionSnapshot?.percentB}% по предматчевой оценке`
                      : `${leadFight.predictionSnapshot?.percentA}% vs ${leadFight.predictionSnapshot?.percentB}% by pre-fight rating`}
                  </span>
                </div>
              ) : null}

              <div className="hero-action-row">
                {leadFight?.predictionSnapshot && leadEvent ? (
                  <Link
                    href={localizePath(`/predictions/${leadEvent.slug}/${leadFight.slug ?? ""}`, locale)}
                    className="button"
                  >
                    {isRu ? "Разбор и прогноз боя" : "Fight breakdown and pick"}
                  </Link>
                ) : null}
                {leadEvent ? (
                  <Link href={localizePath(`/events/${leadEvent.slug}`, locale)} className="button-secondary">
                    {isRu ? "Полный кард" : "Full card"}
                  </Link>
                ) : (
                  <Link href={localizePath("/news", locale)} className="button-secondary">
                    {isRu ? "Лента новостей" : "News feed"}
                  </Link>
                )}
              </div>
            </div>

            <div className="hero-gorilla-sigil" aria-hidden="true">
              <Image
                src="/gorilla-crown-logo.png"
                alt=""
                width={1024}
                height={1024}
                sizes="(max-width: 720px) 180px, (max-width: 1080px) 280px, 360px"
                priority
              />
            </div>

            <div className="hero-poster-mark">
              <span>UFC</span>
            </div>
          </article>

          <div className="hero-rail editorial-rail hero-rail-poster">
            {railFights.length > 0 && leadEvent ? (
              <article className="mini-card red editorial-mini-card hero-rail-card hero-rail-card--lead home-rail-card">
                <h3>
                  {isRu ? "Пики на кард" : "Picks for the card"}
                  <Link href={localizePath("/predictions", locale)} className="section-link">
                    {isRu ? "Все прогнозы" : "All picks"}
                  </Link>
                </h3>
                <ul className="home-picks">
                  {railFights.map((fight) => {
                    const snapshot = fight.predictionSnapshot!;
                    const pick = pickFor(fight);
                    return (
                      <li key={fight.id} className="home-pick">
                        <Link href={localizePath(`/predictions/${leadEvent.slug}/${fight.slug ?? ""}`, locale)}>
                          <span className="home-pick-names">
                            <b>{getDisplayName(fight.fighterA, locale)}</b>
                            <i>vs</i>
                            <b>{getDisplayName(fight.fighterB, locale)}</b>
                          </span>
                        </Link>
                        <span className="home-pick-bar" aria-hidden="true">
                          <span style={{ width: `${snapshot.percentA}%` }} />
                        </span>
                        <span className="home-pick-pct">
                          <span>{snapshot.percentA}%</span>
                          <span>{snapshot.percentB}%</span>
                        </span>
                        {pick ? (
                          <span className="home-pick-verdict">
                            <span className="eyebrow">{isRu ? "Пик FightBase" : "FightBase pick"}</span>
                            {getDisplayName(pick.fighter, locale)}
                            {pick.percent ? ` · ${pick.percent}%` : ""}
                            {pick.underdog ? (
                              <span className="home-pick-underdog">{isRu ? " андердог" : " underdog"}</span>
                            ) : null}
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </article>
            ) : null}

            {articles.length > 0 ? (
              <article className="mini-card gold editorial-mini-card hero-rail-card home-rail-card">
                <h3>
                  {isRu ? "Свежие материалы" : "Latest stories"}
                  <Link href={localizePath("/news", locale)} className="section-link">
                    {isRu ? "Лента" : "Feed"}
                  </Link>
                </h3>
                <ul className="home-headlines">
                  {articles.slice(0, 4).map((article) => (
                    <li key={article.id}>
                      <time dateTime={article.publishedAt.toISOString()}>{formatDayMonth(article.publishedAt)}</time>
                      <Link href={localizePath(getArticleHref(article.category, article.slug), locale)}>{article.title}</Link>
                    </li>
                  ))}
                </ul>
              </article>
            ) : null}

            {p4pRows.length > 0 ? (
              <article className="mini-card blue editorial-mini-card hero-rail-card home-rail-card">
                <h3>
                  {isRu ? "Рейтинг P4P" : "P4P ranking"}
                  <Link href={localizePath("/rankings", locale)} className="section-link">
                    {isRu ? "Все дивизионы" : "All divisions"}
                  </Link>
                </h3>
                <ul className="home-p4p">
                  {p4pRows.map((row, index) => (
                    <li key={`${row.rank}-${row.name}`}>
                      <span className="home-rank">{index + 1}</span>
                      {row.slug ? (
                        <Link href={localizePath(`/fighters/${row.slug}`, locale)}>{row.name}</Link>
                      ) : (
                        <span>{row.name}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </article>
            ) : null}
          </div>
        </div>
      </section>

      <section className="section" aria-label={isRu ? "Точность прогнозов" : "Prediction accuracy"}>
        <div className="container">
          <div className="home-accuracy">
            <p className="eyebrow">{isRu ? "ИИ-модель FightBase" : "FightBase AI model"}</p>
            <p className="copy">
              {accuracy.model.percent !== null
                ? isRu
                  ? `Пики фиксируются до турнира и сверяются с результатами: угадано ${accuracy.model.correct} из ${accuracy.model.judged} боёв (${accuracy.model.percent}%) на последних ${accuracy.eventsCount} турнирах.`
                  : `Picks are locked before each event and scored against results: ${accuracy.model.correct} of ${accuracy.model.judged} bouts called (${accuracy.model.percent}%) across the last ${accuracy.eventsCount} events.`
                : (sinceNote ??
                  (isRu
                    ? "Пики фиксируются до турнира и сверяются с результатами. Первые итоги появятся после ближайшего завершённого карда."
                    : "Picks are locked before each event and scored against the results. The first tally appears after the next completed card."))}
            </p>
            <Link href={localizePath("/predictions/accuracy", locale)} className="section-link">
              {isRu ? "История точности" : "Accuracy history"}
            </Link>
          </div>
        </div>
      </section>

      <section className="section section-surface">
        <div className="container">
          <div className="section-head">
            <div className="section-head-copy">
              <h2>{isRu ? "Последние материалы" : "Latest stories"}</h2>
            </div>
            <Link href={localizePath("/news", locale)} className="section-link">
              {isRu ? "Все новости" : "All stories"}
            </Link>
          </div>
          <div className="story-grid">
            {articles.map((article) => (
              <ArticleCard key={article.id} article={article} locale={locale} />
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="subscribe">
        <div className="container home-two">
          <article className="policy-card home-rail-card">
            <h3>
              {isRu ? "Ближайшие турниры" : "Upcoming events"}
              <Link href={localizePath("/events", locale)} className="section-link">
                {isRu ? "Все турниры" : "All events"}
              </Link>
            </h3>
            {upcomingEvents.length > 0 ? (
              <ul className="home-upcoming">
                {upcomingEvents.map((event) => {
                  const withPicks = event.fights.filter((fight) => fight.predictionSnapshot?.aiPickFighterId).length;
                  return (
                    <li key={event.id}>
                      <span className="home-up-date">{formatShortDate(new Date(event.date))}</span>
                      <Link href={localizePath(`/events/${event.slug}`, locale)}>{event.name}</Link>
                      <span className="home-up-meta">
                        {withPicks > 0
                          ? isRu
                            ? "пики готовы"
                            : "picks ready"
                          : isRu
                            ? "кард собирается"
                            : "card in progress"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="copy">{isRu ? "Ближайшие турниры появятся после анонса карда." : "Upcoming events appear once a card is announced."}</p>
            )}
          </article>

          <article className="policy-card">
            <h3>{isRu ? "Не пропустить турнир" : "Never miss a card"}</h3>
            <p className="copy">
              {isRu
                ? "Кард, пики и результаты турнирного вечера — в Telegram и VK, а push в браузере напомнит перед главным кардом."
                : "Card, picks, and results of fight night in Telegram and VK, plus a browser push before the main card."}
            </p>
            <div className="home-follow-row">
              {hasTelegram ? (
                <MetrikaGoalLink href={telegramUrl} goal="social_telegram_click" className="button" ariaLabel="FightBase Telegram">
                  Telegram
                </MetrikaGoalLink>
              ) : null}
              {hasVk ? (
                <MetrikaGoalLink href={vkUrl} goal="social_vk_click" className="button-secondary" ariaLabel="FightBase VK">
                  VK
                </MetrikaGoalLink>
              ) : null}
              <PushSubscribeButton label={isRu ? "Push в браузере" : "Browser push"} locale={locale} />
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
