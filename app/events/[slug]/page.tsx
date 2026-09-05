import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";

export const revalidate = 3600;

import { Breadcrumbs } from "@/components/breadcrumbs";
import { JsonLd } from "@/components/json-ld";
import { PageHero } from "@/components/page-hero";
import { getArticleHref } from "@/lib/article-routes";
import { buildPairSlug } from "@/lib/compare-pairs";
import { getEventPageData, resolveEventSlugRedirect } from "@/lib/db";
import { describeFightPick, summarizeEventPicks } from "@/lib/event-picks";
import { formatCardNightLabel, formatCardTime, hasCardTimes } from "@/lib/event-time";
import { formatEventLocation, formatFightMethod, formatFightStage, formatFightStatus, formatWeightClass, getDisplayName, isUsablePhoto } from "@/lib/display";
import { formatWinnerlessFightResult, sortFightsForCard } from "@/lib/fight-card";
import { getLocale } from "@/lib/i18n";
import { buildLocaleAlternates, localizePath } from "@/lib/locale-path";
import { ogImageUrl } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site";
import { buildTrailBreadcrumbJsonLd, buildSportsEventJsonLd, toAbsoluteUrl } from "@/lib/structured-data";

async function redirectRenamedEvent(slug: string, locale: Awaited<ReturnType<typeof getLocale>>) {
  const target = await resolveEventSlugRedirect(slug);
  if (target) {
    permanentRedirect(localizePath(`/events/${target}`, locale));
  }
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const data = await getEventPageData(slug);

  if (!data) {
    // Турнир переименовали (объявили главный бой) — старый адрес из выдачи
    // ведём на новый. Иначе real HTTP 404: metadata resolves before the
    // streamed shell commits a 200.
    await redirectRenamedEvent(slug, locale);
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
  const mainEvent = orderedFights[0];
  const mainEventLine = mainEvent
    ? locale === "ru"
      ? ` Главный бой: ${getDisplayName(mainEvent.fighterA, locale)} — ${getDisplayName(mainEvent.fighterB, locale)}.`
      : ` Main event: ${getDisplayName(mainEvent.fighterA, locale)} vs ${getDisplayName(mainEvent.fighterB, locale)}.`
    : "";
  const dateLabel = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(event.date);
  const location = formatEventLocation(event.city, event.venue, locale);
  const description =
    locale === "ru"
      ? isCompleted
        ? `${event.name}: результаты всех ${fightCount} боёв, ${dateLabel}${location ? `, ${location}` : ""}.${mainEventLine} Итоги пиков ИИ-модели FightBase и разборы боёв.`
        : `${event.name}: ${dateLabel}${location ? `, ${location}` : ""}. Кард из ${fightCount} боёв, время по Москве, прогнозы FightBase на каждый бой.${mainEventLine}${startLine}`
      : isCompleted
        ? `${event.name}: results of all ${fightCount} fights, ${dateLabel}${location ? `, ${location}` : ""}.${mainEventLine} FightBase AI pick tally and fight breakdowns.`
        : `${event.name}: ${dateLabel}${location ? `, ${location}` : ""}. ${fightCount}-fight card, start times, FightBase picks for every bout.${mainEventLine}${startLine}`;

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
    await redirectRenamedEvent(slug, locale);
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
  const isCompleted = event.status === "completed";
  const picks = summarizeEventPicks(orderedFights);
  const leadPick = leadFight ? describeFightPick(leadFight) : null;
  const dateLabel = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(event.date);
  const fightWord = (count: number) =>
    locale === "ru" ? `${count} ${count % 10 === 1 && count % 100 !== 11 ? "бой" : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20) ? "боя" : "боёв"}` : `${count} fights`;
  const heroBits = [
    dateLabel,
    formatEventLocation(event.city, event.venue, locale),
    leadFight
      ? `${locale === "ru" ? "Главный бой" : "Main event"}: ${getDisplayName(leadFight.fighterA, locale)} vs ${getDisplayName(leadFight.fighterB, locale)}`
      : null,
    orderedFights.length > 0 ? fightWord(orderedFights.length) : null
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean);
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
      <PageHero eyebrow={event.promotion.shortName} title={event.name} description={heroBits.join(" · ")} />

      {isCompleted ? (
        <section className="policy-card" aria-label={locale === "ru" ? "Итоги турнира" : "Event recap"}>
          <p className="kicker">{locale === "ru" ? "Итоги турнира" : "Event recap"}</p>
          <p className="copy">
            {locale === "ru"
              ? `Турнир завершён: ${fightWord(orderedFights.length)}, результаты в карде ниже.`
              : `The event is over: ${fightWord(orderedFights.length)}, results are in the card below.`}
            {picks.judged > 0
              ? locale === "ru"
                ? ` ИИ-модель FightBase угадала победителя в ${picks.correct} из ${picks.judged} боёв${picks.upsets > 0 ? `, включая ${picks.upsets} ${picks.upsets === 1 ? "апсет" : picks.upsets < 5 ? "апсета" : "апсетов"}` : ""}.`
                : ` The FightBase AI model called ${picks.correct} of ${picks.judged} bouts${picks.upsets > 0 ? `, including ${picks.upsets} upset${picks.upsets === 1 ? "" : "s"}` : ""}.`
              : ""}
            {" "}
            <Link href={localizePath("/predictions/accuracy", locale)}>{locale === "ru" ? "История точности →" : "Accuracy history →"}</Link>
          </p>
        </section>
      ) : null}

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
                {isCompleted
                  ? locale === "ru"
                    ? "Победитель, метод и раунд по каждому бою; у боёв с прогнозом отмечен пик ИИ-модели FightBase."
                    : "Winner, method and round for every fight; bouts with a prediction show the FightBase AI pick."
                  : picks.withPicks > 0
                    ? locale === "ru"
                      ? `Пики ИИ-модели FightBase готовы на ${picks.withPicks} из ${fightWord(orderedFights.length)}; остальные появятся после обновления карда.`
                      : `FightBase AI picks are ready for ${picks.withPicks} of ${fightWord(orderedFights.length)}; the rest follow the next card update.`
                    : locale === "ru"
                      ? "Прогнозы появятся после объявления полного карда."
                      : "Predictions appear once the full card is announced."}
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
                      {(() => {
                        const pick = describeFightPick(fight);
                        const pickName = pick
                          ? getDisplayName(pick.side === "A" ? fight.fighterA : fight.fighterB, locale)
                          : null;
                        const pickMark = pick?.verdict === "correct" ? " ✓" : pick?.verdict === "wrong" ? " ✗" : "";
                        return fight.status === "completed" && fight.winnerFighterId ? (
                          <span className="event-table-result">
                            <strong>
                              {fight.winnerFighterId === fight.fighterAId
                                ? getDisplayName(fight.fighterA, locale)
                                : getDisplayName(fight.fighterB, locale)}
                            </strong>
                            {fight.method ? ` — ${formatFightMethod(fight.method, locale)}` : ""}
                            {fight.resultRound ? `, R${fight.resultRound}` : ""}
                            {fight.resultTime ? ` ${fight.resultTime}` : ""}
                            {pickName ? (
                              <span className="event-table-pick">
                                {locale === "ru" ? "пик" : "pick"}: {pickName}
                                {pickMark}
                              </span>
                            ) : null}
                          </span>
                        ) : fight.status === "completed" ? (
                          <span className="event-table-result">
                            {formatWinnerlessFightResult(fight.resultType, locale)}
                          </span>
                        ) : fight.predictionSnapshot ? (
                          <span className="event-table-result">
                            {pickName ? (
                              <span className="event-table-pick">
                                {locale === "ru" ? "Пик" : "Pick"}: <strong>{pickName}</strong>
                                {pick?.percent ? ` · ${pick.percent}%` : ""}
                              </span>
                            ) : null}
                            <Link href={localizePath(`/predictions/${event.slug}/${fight.slug}`, locale)} className="event-table-link">
                              {locale === "ru" ? "Разбор боя" : "Fight breakdown"}
                            </Link>
                          </span>
                        ) : null;
                      })()}
                      {fight.status !== "completed" && !fight.predictionSnapshot ? (
                        <span className="event-table-pending">{locale === "ru" ? "Прогноз ожидается" : "Prediction pending"}</span>
                      ) : null}
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
          {leadFight ? (
            <div className="policy-card">
              <h3>{locale === "ru" ? "Главный бой" : "Main event"}</h3>
              <p className="copy">
                <strong>
                  {getDisplayName(leadFight.fighterA, locale)} vs {getDisplayName(leadFight.fighterB, locale)}
                </strong>
                {" · "}
                {formatWeightClass(leadFight.weightClass, locale)}
                {leadPick ? (
                  <>
                    <br />
                    {locale === "ru" ? "Пик ИИ-модели FightBase" : "FightBase AI pick"}:{" "}
                    <strong>{getDisplayName(leadPick.side === "A" ? leadFight.fighterA : leadFight.fighterB, locale)}</strong>
                    {leadPick.percent ? ` (${leadPick.percent}%)` : ""}
                    {leadPick.verdict === "correct" ? (locale === "ru" ? " — угадан" : " — correct") : leadPick.verdict === "wrong" ? (locale === "ru" ? " — не угадан" : " — missed") : ""}
                  </>
                ) : null}
              </p>
              <p className="copy">
                {leadFight.predictionSnapshot && leadFight.slug ? (
                  <Link href={localizePath(`/predictions/${event.slug}/${leadFight.slug}`, locale)}>
                    {locale === "ru" ? "Разбор и прогноз боя →" : "Breakdown and pick →"}
                  </Link>
                ) : (
                  <Link href={localizePath(`/compare/${buildPairSlug(leadFight.fighterA.slug, leadFight.fighterB.slug)}`, locale)}>
                    {locale === "ru" ? "Сравнить бойцов →" : "Compare fighters →"}
                  </Link>
                )}
              </p>
            </div>
          ) : null}
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
