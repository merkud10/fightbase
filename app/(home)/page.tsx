
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const revalidate = 1800;

import { ArticleCard } from "@/components/cards";
import { getArticleHref } from "@/lib/article-routes";
import { JsonLd } from "@/components/json-ld";
import { MetrikaGoalLink, MetrikaInternalLink } from "@/components/metrika-goal-link";
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
import { isPickPending, pickPendingText } from "@/lib/event-picks";
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
    ? "Новости UFC, расписание и карды турниров, прогнозы на бои, рейтинги и карточки бойцов."
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
  // Кард ближайшего турнира: только бои со снапшотом прогноза, главный бой уже
  // показан полосой выше.
  const cardFights = leadEventFights.filter((fight) => fight.predictionSnapshot).slice(1, 8);
  // Первый экран — новости: главная с фото и колонка заголовков, остальное сеткой ниже.
  const leadArticle = articles[0] ?? null;
  const headlineArticles = articles.slice(1, 6);
  const moreArticles = articles.slice(6, 15);
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
  const formatStamp = (date: Date) =>
    new Intl.DateTimeFormat(dateLocale, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" }).format(date);
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

      <section className="container home-top" aria-label={isRu ? "Главное" : "Top stories"}>
        <h1 className="home-kicker">{isRu ? "Новости UFC" : "UFC news"}</h1>
        <div className="home-top-grid">
          {leadArticle ? (
            <article className="home-lead">
              {leadArticle.coverImageUrl ? (
                <Link href={localizePath(getArticleHref(leadArticle.category, leadArticle.slug), locale)} className="home-lead-cover">
                  <Image
                    src={getDisplayImageUrl(leadArticle.coverImageUrl)}
                    alt={leadArticle.coverImageAlt || leadArticle.title}
                    width={960}
                    height={540}
                    sizes="(max-width: 1000px) 100vw, 700px"
                    priority
                  />
                </Link>
              ) : null}
              <p className="home-item-date">
                <time dateTime={leadArticle.publishedAt.toISOString()}>{formatStamp(leadArticle.publishedAt)}</time>
              </p>
              <h2>
                <Link href={localizePath(getArticleHref(leadArticle.category, leadArticle.slug), locale)}>{leadArticle.title}</Link>
              </h2>
              <p className="home-lead-excerpt">{leadArticle.excerpt}</p>
            </article>
          ) : null}

          {headlineArticles.length > 0 ? (
            <div className="home-headlines-col">
              <ul className="home-headline-list">
                {headlineArticles.map((article) => (
                  <li key={article.id}>
                    <time dateTime={article.publishedAt.toISOString()}>{formatStamp(article.publishedAt)}</time>
                    <Link href={localizePath(getArticleHref(article.category, article.slug), locale)}>{article.title}</Link>
                  </li>
                ))}
              </ul>
              <Link href={localizePath("/news", locale)} className="home-more">
                {isRu ? "Все новости →" : "All stories →"}
              </Link>
            </div>
          ) : null}
        </div>
      </section>

      {leadEvent && leadFight ? (
        <section className="container" aria-label={isRu ? "Ближайший турнир" : "Next event"}>
          <div className="home-fight">
            <div className="home-fight-info">
              <p className="home-fight-label">
                {isRu ? "Ближайший турнир" : "Next event"} · {formatShortDate(new Date(leadEvent.date))} ·{" "}
                {formatEventLocation(leadEvent.city, leadEvent.venue, locale)}
              </p>
              <h2>
                {getDisplayName(leadFight.fighterA, locale)} — {getDisplayName(leadFight.fighterB, locale)}
              </h2>
              <p className="home-fight-sub">
                {leadEvent.name} · {formatWeightClass(leadFight.weightClass, locale)}
              </p>
              {leadPick ? (
                <p className="home-fight-pick">
                  <span>{isRu ? "Пик ИИ-модели" : "AI model pick"}</span>
                  <strong>
                    {getDisplayName(leadPick.fighter, locale)} · {leadPick.percent}%
                  </strong>
                  {leadPick.underdog ? <em>{isRu ? "андердог" : "underdog"}</em> : null}
                </p>
              ) : isPickPending(leadFight) ? (
                <p className="home-fight-pick home-fight-pick--pending">{pickPendingText(locale)}</p>
              ) : null}
              <div className="home-fight-actions">
                {leadFight.predictionSnapshot ? (
                  <MetrikaInternalLink
                    href={localizePath(`/predictions/${leadEvent.slug}/${leadFight.slug ?? ""}`, locale)}
                    goal="home_prediction_click"
                    className="button"
                  >
                    {isRu ? "Разбор и прогноз боя" : "Fight breakdown and pick"}
                  </MetrikaInternalLink>
                ) : null}
                <MetrikaInternalLink href={localizePath(`/events/${leadEvent.slug}`, locale)} goal="home_event_click" className="button-secondary">
                  {isRu ? "Полный кард" : "Full card"}
                </MetrikaInternalLink>
              </div>
            </div>
            <div className="home-fight-faces" aria-hidden="true">
              {isUsablePhoto(leadFight.fighterA.photoUrl) ? (
                <Image src={getDisplayImageUrl(String(leadFight.fighterA.photoUrl))} alt="" width={180} height={220} sizes="(max-width: 720px) 34vw, 150px" />
              ) : null}
              {isUsablePhoto(leadFight.fighterB.photoUrl) ? (
                <Image src={getDisplayImageUrl(String(leadFight.fighterB.photoUrl))} alt="" width={180} height={220} sizes="(max-width: 720px) 34vw, 150px" />
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      <section className="container home-three">
        {cardFights.length > 0 && leadEvent ? (
          <div className="home-block">
            <h3>
              {isRu ? "Кард турнира" : "Fight card"}
              <Link href={localizePath("/predictions", locale)} className="section-link">
                {isRu ? "Все прогнозы" : "All picks"}
              </Link>
            </h3>
            <ul className="home-card-list">
              {cardFights.map((fight) => {
                const pick = pickFor(fight);
                return (
                  <li key={fight.id}>
                    <Link href={localizePath(`/predictions/${leadEvent.slug}/${fight.slug ?? ""}`, locale)}>
                      {getDisplayName(fight.fighterA, locale)} — {getDisplayName(fight.fighterB, locale)}
                    </Link>
                    {pick ? (
                      <span className="home-card-pick">
                        {isRu ? "пик: " : "pick: "}
                        {getDisplayName(pick.fighter, locale)}
                        {pick.percent ? `, ${pick.percent}%` : ""}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {cardFights.some((fight) => !pickFor(fight) && isPickPending(fight)) ? (
              <p className="home-note">{pickPendingText(locale)}</p>
            ) : null}
          </div>
        ) : null}

        {p4pRows.length > 0 ? (
          <div className="home-block">
            <h3>
              {isRu ? "Рейтинг P4P" : "P4P ranking"}
              <Link href={localizePath("/rankings", locale)} className="section-link">
                {isRu ? "Все дивизионы" : "All divisions"}
              </Link>
            </h3>
            <ol className="home-p4p">
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
            </ol>
          </div>
        ) : null}

        <div className="home-block" aria-label={isRu ? "Точность прогнозов" : "Prediction accuracy"}>
          <h3>
            {isRu ? "ИИ-модель FightBase" : "FightBase AI model"}
            <Link href={localizePath("/predictions/accuracy", locale)} className="section-link">
              {isRu ? "История точности" : "Accuracy history"}
            </Link>
          </h3>
          {accuracy.model.percent !== null ? (
            <p className="home-accuracy-figure">
              <strong>{accuracy.model.percent}%</strong>
              <span>
                {isRu
                  ? `угадано ${accuracy.model.correct} из ${accuracy.model.judged} боёв на последних ${accuracy.eventsCount} турнирах`
                  : `${accuracy.model.correct} of ${accuracy.model.judged} bouts called across the last ${accuracy.eventsCount} events`}
              </span>
            </p>
          ) : null}
          <p className="home-note">
            {accuracy.model.percent !== null
              ? isRu
                ? "Пики фиксируются до турнира и сверяются с результатами."
                : "Picks are locked before each event and scored against results."
              : (sinceNote ??
                (isRu
                  ? "Пики фиксируются до турнира и сверяются с результатами. Первые итоги появятся после ближайшего завершённого карда."
                  : "Picks are locked before each event and scored against the results. The first tally appears after the next completed card."))}
          </p>
        </div>
      </section>

      {moreArticles.length > 0 ? (
        <section className="section">
          <div className="container">
            <div className="section-head">
              <div className="section-head-copy">
                <h2>{isRu ? "Ещё материалы" : "More stories"}</h2>
              </div>
              <Link href={localizePath("/news", locale)} className="section-link">
                {isRu ? "Все новости" : "All stories"}
              </Link>
            </div>
            <div className="story-grid">
              {moreArticles.map((article) => (
                <ArticleCard key={article.id} article={article} locale={locale} />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="section" id="subscribe">
        <div className="container home-two">
          <article className="home-block">
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
                          : event.fights.length > 0
                            ? isRu
                              ? "пики — за 2–3 дня"
                              : "picks 2–3 days before"
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

          <article className="home-block">
            <h3>{isRu ? "Не пропустить турнир" : "Never miss a card"}</h3>
            <p className="copy">
              {isRu
                ? "Пики на весь кард и новости UFC — в Telegram и VK, а push в браузере напомнит перед главным кардом."
                : "Full-card picks and UFC news in Telegram and VK, plus a browser push before the main card."}
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
