import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { JsonLd } from "@/components/json-ld";
import { PageHero } from "@/components/page-hero";
import { getArticleHref } from "@/lib/article-routes";
import { buildPairSlug } from "@/lib/compare-pairs";
import { getFightPredictionPageData, getPredictionFallbackEventSlug, getPredictionPageParams } from "@/lib/db";
import { formatEventLocation, formatFightMethod, formatWeightClass, isUsablePhoto } from "@/lib/display";
import { resolveAiPickVerdict, resolvePredictionVerdict } from "@/lib/prediction-verdict";
import { getDisplayImageUrl } from "@/lib/image-proxy";
import { getLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/locale-config";
import { buildLocaleAlternates, localizePath } from "@/lib/locale-path";
import { fighterHasComparableStats, getDisplayName } from "@/lib/predictions";
import { getSnapshotContent } from "@/lib/prediction-snapshot";
import { clampDescription, ogImageUrl } from "@/lib/seo";
import { isPlaceholderFightSlug } from "@/lib/sitemap-entries";
import { ShareButtons } from "@/components/share-buttons";
import { getSiteUrl } from "@/lib/site";
import { buildSportsEventJsonLd, toAbsoluteUrl } from "@/lib/structured-data";

export const revalidate = 86400;
export const dynamicParams = true;

function splitIntoParagraphs(text: string) {
  const normalized = text
    .replace(/\r/g, "")
    .replace(/\*\*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const explicitParagraphs = normalized
    .split(/\n\s*\n+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (explicitParagraphs.length > 1) {
    return explicitParagraphs;
  }

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (sentences.length <= 3) {
    return [normalized];
  }

  const chunks: string[] = [];
  for (let index = 0; index < sentences.length; index += 3) {
    chunks.push(sentences.slice(index, index + 3).join(" "));
  }

  return chunks;
}

function hasUsablePhoto(url?: string | null) {
  return (
    Boolean(url) &&
    !/silhouette|logo_of_the_ultimate_fighting_championship|flag_of_|\/themes\/custom\/ufc\/assets\/img\//i.test(
      String(url)
    )
  );
}

// Снимок прогноза удаляется после турнира — адрес, который был в выдаче, не
// должен превращаться в 404: сам бой остаётся описан на странице события.
async function redirectToEventFallback(eventSlug: string, fightSlug: string, locale: Locale) {
  const fallback = await getPredictionFallbackEventSlug(eventSlug, fightSlug);

  if (fallback) {
    permanentRedirect(localizePath(`/events/${fallback}`, locale));
  }
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ eventSlug: string; fightSlug: string }>;
}): Promise<Metadata> {
  const { eventSlug, fightSlug } = await params;
  const locale = await getLocale();
  const data = await getFightPredictionPageData(eventSlug, fightSlug);

  if (!data) {
    // Real HTTP 404: metadata resolves before the streamed shell commits a 200.
    await redirectToEventFallback(eventSlug, fightSlug, locale);
    notFound();
  }

  const { snapshot, fight } = data;
  const snapshotContent = getSnapshotContent(snapshot, locale);
  const metaDescription = clampDescription(snapshotContent.metaDescription);
  const ogImage = ogImageUrl(
    [fight.fighterA.photoUrl, fight.fighterB.photoUrl].find((url) => isUsablePhoto(url))
  );

  return {
    title: snapshotContent.titleTag,
    description: metaDescription,
    alternates: {
      ...buildLocaleAlternates(`/predictions/${eventSlug}/${fightSlug}`),
      canonical: localizePath(`/predictions/${eventSlug}/${fightSlug}`, locale)
    },
    openGraph: {
      type: "article",
      title: snapshotContent.titleTag,
      description: metaDescription,
      url: localizePath(`/predictions/${eventSlug}/${fightSlug}`, locale),
      images: [ogImage]
    },
    twitter: {
      card: "summary_large_image",
      title: snapshotContent.titleTag,
      description: metaDescription,
      images: [ogImage]
    },
    robots: {
      // Бои без объявленного соперника дают неотличимые друг от друга страницы
      // («Opponent TBA — TBA»), поэтому в индекс идут только определённые пары.
      index: !isPlaceholderFightSlug(fightSlug),
      follow: true
    }
  };
}

export async function generateStaticParams() {
  const params = await getPredictionPageParams();

  return params.map((entry) => ({
    eventSlug: entry.fight.event.slug,
    fightSlug: entry.fight.slug!
  }));
}

export default async function FightPredictionPage({
  params
}: {
  params: Promise<{ eventSlug: string; fightSlug: string }>;
}) {
  const { eventSlug, fightSlug } = await params;
  const locale = await getLocale();
  const data = await getFightPredictionPageData(eventSlug, fightSlug);

  if (!data) {
    await redirectToEventFallback(eventSlug, fightSlug, locale);
    notFound();
  }

  const { fight, snapshot, relatedArticles, relatedPredictionArticles, fightPredictionArticle } = data;
  const prediction = getSnapshotContent(snapshot, locale);
  const fighterAPercent = snapshot.percentA;
  const fighterBPercent = snapshot.percentB;
  const showStatsCompare =
    fighterHasComparableStats(fight.fighterA) || fighterHasComparableStats(fight.fighterB);
  const sidebarPredictionLinks = fightPredictionArticle
    ? relatedPredictionArticles.filter((a) => a.id !== fightPredictionArticle.id)
    : relatedPredictionArticles;
  const siteUrl = getSiteUrl();
  const pageUrl = new URL(localizePath(`/predictions/${eventSlug}/${fightSlug}`, locale), siteUrl).toString();
  const fighterAName = getDisplayName(fight.fighterA, locale);
  const fighterBName = getDisplayName(fight.fighterB, locale);
  const siteOrigin = siteUrl.origin;
  const fightEventImages = [fight.fighterA.photoUrl, fight.fighterB.photoUrl]
    .filter((url): url is string => isUsablePhoto(url))
    .map((url) => toAbsoluteUrl(url, siteOrigin));
  const predictionImage = ogImageUrl(fightEventImages[0]);
  const fightEventJsonLd = buildSportsEventJsonLd({
    name: `${fight.event.name}: ${fighterAName} vs ${fighterBName}`,
    description: prediction.metaDescription,
    url: pageUrl,
    inLanguage: locale === "ru" ? "ru-RU" : "en-US",
    date: fight.event.date,
    venue: fight.event.venue,
    city: fight.event.city,
    status: fight.event.status,
    promotionName: fight.event.promotion.name,
    siteOrigin,
    performers: [
      { name: fighterAName, url: `${siteOrigin}${localizePath(`/fighters/${fight.fighterA.slug}`, locale)}` },
      { name: fighterBName, url: `${siteOrigin}${localizePath(`/fighters/${fight.fighterB.slug}`, locale)}` }
    ],
    images: fightEventImages.length > 0 ? fightEventImages : [`${siteOrigin}/gorilla-crown-logo.png`]
  });
  const breadcrumbItems = [
    { label: locale === "ru" ? "Главная" : "Home", href: "/" },
    { label: locale === "ru" ? "Прогнозы" : "Predictions", href: "/predictions" },
    { label: fight.event.name, href: `/events/${fight.event.slug}` },
    { label: prediction.headline }
  ];

  return (
    <main className="container">
      {fightEventJsonLd && <JsonLd data={fightEventJsonLd} />}
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: prediction.headline,
          description: prediction.metaDescription,
          image: [predictionImage],
          datePublished: snapshot.generatedAt.toISOString(),
          dateModified: snapshot.updatedAt.toISOString(),
          mainEntityOfPage: pageUrl,
          url: pageUrl,
          inLanguage: locale === "ru" ? "ru-RU" : "en-US",
          author: {
            "@type": "Organization",
            name: "FightBase Media",
            url: `${siteOrigin}/ru`
          },
          publisher: {
            "@type": "Organization",
            name: "FightBase Media",
            url: `${siteOrigin}/ru`,
            logo: {
              "@type": "ImageObject",
              url: `${siteOrigin}/gorilla-crown-logo.png`
            }
          },
          about: [fight.fighterA.name, fight.fighterB.name, fight.event.name]
        }}
      />
      <Breadcrumbs items={breadcrumbItems} locale={locale} />
      <PageHero
        title={prediction.headline}
        description={`${fight.event.promotion.shortName} · ${fight.event.name} · ${formatWeightClass(fight.weightClass, locale)}`}
      />

      <section className="prediction-hero-card">
        <div className="prediction-hero-fighter">
          {hasUsablePhoto(fight.fighterA.photoUrl) ? (
            <Image
              src={getDisplayImageUrl(String(fight.fighterA.photoUrl))}
              alt={fighterAName}
              className="prediction-hero-photo"
              width={140}
              height={220}
              sizes="(max-width: 560px) 220px, (max-width: 960px) 120px, 140px"
            />
          ) : (
            <div className="prediction-hero-photo prediction-hero-photo--placeholder">{fighterAName.charAt(0)}</div>
          )}
          <div>
            <span className="prediction-hero-label">{locale === "ru" ? "Сторона A" : "Side A"}</span>
            <h3>{fighterAName}</h3>
            <p className="copy">{fight.fighterA.record || "-"}</p>
          </div>
        </div>

        <div className="prediction-hero-center">
          <span className="prediction-label">{locale === "ru" ? "Фаворит" : "Favorite"}</span>
          <strong>{prediction.pick}</strong>
          {(() => {
            if (!snapshot.aiPickFighterId) return null;
            const aiPickName =
              snapshot.aiPickFighterId === fight.fighterAId
                ? fighterAName
                : snapshot.aiPickFighterId === fight.fighterBId
                  ? fighterBName
                  : null;
            if (!aiPickName) return null;
            const favoriteFighterId =
              snapshot.percentA >= snapshot.percentB ? fight.fighterAId : fight.fighterBId;
            const againstOdds = snapshot.aiPickFighterId !== favoriteFighterId;
            return (
              <p className="copy prediction-meter-caption">
                <strong>{locale === "ru" ? "Прогноз FightBase" : "FightBase pick"}: {aiPickName}</strong>
                {againstOdds ? (locale === "ru" ? " · против котировок" : " · against the odds") : null}
                {snapshot.aiPickReasonRu && locale === "ru" ? <> — {snapshot.aiPickReasonRu}</> : null}
              </p>
            );
          })()}
          <div className="prediction-meter">
            <div className="prediction-meter-fill" style={{ width: `${fighterAPercent}%` }} />
          </div>
          <div className="prediction-meter-scale">
            <span>{fighterAPercent}%</span>
            <span>{fighterBPercent}%</span>
          </div>
          {snapshot.source === "heuristic" ? (
            <p className="copy prediction-meter-caption">
              {locale === "ru"
                ? "Снимок прогноза собран по рекорду, текущей форме и доступной статистике бойцов."
                : "This prediction snapshot is built from fighter record, current form, and available stats."}
            </p>
          ) : null}
        </div>

        <div className="prediction-hero-fighter prediction-hero-fighter--reverse">
          {hasUsablePhoto(fight.fighterB.photoUrl) ? (
            <Image
              src={getDisplayImageUrl(String(fight.fighterB.photoUrl))}
              alt={fighterBName}
              className="prediction-hero-photo"
              width={140}
              height={220}
              sizes="(max-width: 560px) 220px, (max-width: 960px) 120px, 140px"
            />
          ) : (
            <div className="prediction-hero-photo prediction-hero-photo--placeholder">{fighterBName.charAt(0)}</div>
          )}
          <div>
            <span className="prediction-hero-label">{locale === "ru" ? "Сторона B" : "Side B"}</span>
            <h3>{fighterBName}</h3>
            <p className="copy">{fight.fighterB.record || "-"}</p>
          </div>
        </div>
      </section>

      <p className="compare-cta">
        <Link
          href={localizePath(`/compare/${buildPairSlug(fight.fighterA.slug, fight.fighterB.slug)}`, locale)}
          className="event-table-link"
        >
          {locale === "ru" ? "Сравнить бойцов" : "Compare fighters"}
        </Link>
      </p>

      {fight.status === "completed" ? (() => {
        const verdict = resolvePredictionVerdict({
          percentA: snapshot.percentA,
          percentB: snapshot.percentB,
          fighterAId: fight.fighterAId,
          fighterBId: fight.fighterBId,
          status: fight.status,
          resultType: fight.resultType,
          winnerFighterId: fight.winnerFighterId
        });
        const winnerName =
          fight.winnerFighterId === fight.fighterAId
            ? fighterAName
            : fight.winnerFighterId === fight.fighterBId
              ? fighterBName
              : null;
        const methodLabel = fight.method ? formatFightMethod(fight.method, locale) : null;
        const roundLabel = fight.resultRound
          ? `R${fight.resultRound}${fight.resultTime ? ` · ${fight.resultTime}` : ""}`
          : null;
        const resultLine =
          fight.resultType === "win" && winnerName
            ? [`${winnerName} — ${locale === "ru" ? "победа" : "win"}`, methodLabel, roundLabel]
                .filter(Boolean)
                .join(" · ")
            : fight.resultType === "draw"
              ? locale === "ru"
                ? "Ничья"
                : "Draw"
              : fight.resultType === "no_contest"
                ? locale === "ru"
                  ? "Бой признан несостоявшимся"
                  : "No contest"
                : locale === "ru"
                  ? "Результат уточняется"
                  : "Result pending verification";

        return (
          <section className="policy-card" aria-label={locale === "ru" ? "Итог боя" : "Fight result"}>
            <h2>{locale === "ru" ? "Итог боя" : "Fight result"}</h2>
            <p className="copy">{resultLine}</p>
            {verdict === "correct" ? (
              <p className="kicker">{locale === "ru" ? "Фаворит подтвердил статус ✓" : "The favorite delivered ✓"}</p>
            ) : verdict === "wrong" ? (
              <p className="kicker">{locale === "ru" ? "Апсет: фаворит проиграл" : "Upset: the favorite lost"}</p>
            ) : (
              <p className="kicker">
                {locale === "ru" ? "Без чистого победителя — оценка не засчитана" : "No clean winner — not scored"}
              </p>
            )}
            {(() => {
              const aiVerdict = resolveAiPickVerdict({
                aiPickFighterId: snapshot.aiPickFighterId,
                status: fight.status,
                resultType: fight.resultType,
                winnerFighterId: fight.winnerFighterId
              });
              if (aiVerdict === "correct") {
                const wasUpset = verdict === "wrong";
                return (
                  <p className="kicker">
                    {locale === "ru"
                      ? wasUpset
                        ? "Прогноз FightBase угадал апсет ✓✓"
                        : "Прогноз FightBase угадал победителя ✓"
                      : wasUpset
                        ? "FightBase pick called the upset ✓✓"
                        : "FightBase pick was correct ✓"}
                  </p>
                );
              }
              if (aiVerdict === "wrong") {
                return (
                  <p className="kicker">
                    {locale === "ru" ? "Прогноз FightBase не угадал ✗" : "FightBase pick missed ✗"}
                  </p>
                );
              }
              return null;
            })()}
          </section>
        );
      })() : null}

      <section className="detail-grid">
        <article className="table-card prediction-detail-card">
          <div className="prediction-sections prediction-sections--editorial">
            {fightPredictionArticle ? (
              <section className="prediction-section-card prediction-section-card--article">
                <h3>{locale === "ru" ? "Разбор" : "Breakdown"}</h3>
                <p className="copy">
                  <Link
                    href={localizePath(
                      getArticleHref(fightPredictionArticle.category, fightPredictionArticle.slug),
                      locale
                    )}
                    className="event-table-link"
                  >
                    {locale === "ru" ? "Открыть полный материал" : "Open full article"}
                  </Link>
                </p>
                {fightPredictionArticle.sections.map((section) => (
                  <div key={section.id} className="prediction-article-section">
                    {section.heading ? <h4 className="prediction-article-heading">{section.heading}</h4> : null}
                    {splitIntoParagraphs(section.body).map((paragraph, index) => (
                      <p key={`${section.id}-${index}`} className="copy">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                ))}
              </section>
            ) : null}

            {!fightPredictionArticle ? (
              <>
                <section className="prediction-section-card">
                  <h3>{locale === "ru" ? "Общая картина" : "Matchup overview"}</h3>
                  <p className="copy">{prediction.overview}</p>
                </section>
                <section className="prediction-section-card">
                  <h3>{locale === "ru" ? "Ключевое преимущество" : "Key edge"}</h3>
                  <p className="copy">{prediction.keyEdge}</p>
                </section>
                <section className="prediction-section-card">
                  <h3>{locale === "ru" ? "Ожидаемый сценарий" : "Likely fight script"}</h3>
                  <p className="copy">{prediction.fightScript}</p>
                </section>
                <section className="prediction-section-card">
                  <h3>{locale === "ru" ? "Форма перед боем" : "Recent form"}</h3>
                  <p className="copy">{prediction.formA}</p>
                  <p className="copy">{prediction.formB}</p>
                </section>
                <section className="prediction-section-card">
                  <h3>{locale === "ru" ? "Пути к победе" : "Paths to victory"}</h3>
                  <p className="copy">{prediction.pathA}</p>
                  <p className="copy">{prediction.pathB}</p>
                </section>
              </>
            ) : (
              <>
                <section className="prediction-section-card">
                  <h3>{locale === "ru" ? "Форма перед боем" : "Recent form"}</h3>
                  <p className="copy">{prediction.formA}</p>
                  <p className="copy">{prediction.formB}</p>
                </section>
                <section className="prediction-section-card">
                  <h3>{locale === "ru" ? "Пути к победе" : "Paths to victory"}</h3>
                  <p className="copy">{prediction.pathA}</p>
                  <p className="copy">{prediction.pathB}</p>
                </section>
              </>
            )}

            {prediction.statLines.length > 0 ? (
              <section className="prediction-section-card">
                <h3>{locale === "ru" ? "Ключевые цифры" : "Key metrics"}</h3>
                <ul className="event-side-list">
                  {prediction.statLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          {showStatsCompare ? (
          <div className="prediction-stats-grid">
            {[fight.fighterA, fight.fighterB].map((fighter) => (
              <div key={fighter.id} className="stat-card prediction-fighter-stat">
                <p className="kicker">{getDisplayName(fighter, locale)}</p>
                <ul className="prediction-stat-list">
                  <li>
                    <span>{locale === "ru" ? "Рекорд" : "Record"}</span>
                    <strong>{fighter.record || "-"}</strong>
                  </li>
                  <li>
                    <span>SLpM</span>
                    <strong>{fighter.sigStrikesLandedPerMin?.toFixed(2) ?? "-"}</strong>
                  </li>
                  <li>
                    <span>{locale === "ru" ? "Точность ударов" : "Strike accuracy"}</span>
                    <strong>{fighter.strikeAccuracy != null ? `${Math.round(fighter.strikeAccuracy)}%` : "-"}</strong>
                  </li>
                  <li>
                    <span>{locale === "ru" ? "Защита в стойке" : "Strike defense"}</span>
                    <strong>{fighter.strikeDefense != null ? `${Math.round(fighter.strikeDefense)}%` : "-"}</strong>
                  </li>
                  <li>
                    <span>TD avg</span>
                    <strong>{fighter.takedownAveragePer15?.toFixed(2) ?? "-"}</strong>
                  </li>
                  <li>
                    <span>TD defense</span>
                    <strong>{fighter.takedownDefense != null ? `${Math.round(fighter.takedownDefense)}%` : "-"}</strong>
                  </li>
                </ul>
              </div>
            ))}
          </div>
          ) : [fight.fighterA, fight.fighterB].some(
              (fighter) => fighter.record || fighter.age || fighter.heightCm || fighter.reachCm
            ) ? (
          // Запасное сравнение для боёв без UFC-статистики (дебютанты, новички карда):
          // базовые данные вместо пустого места. Нули в базе означают «нет данных».
          <div className="prediction-stats-grid">
            {[fight.fighterA, fight.fighterB].map((fighter) => (
              <div key={fighter.id} className="stat-card prediction-fighter-stat">
                <p className="kicker">{getDisplayName(fighter, locale)}</p>
                <ul className="prediction-stat-list">
                  <li>
                    <span>{locale === "ru" ? "Рекорд" : "Record"}</span>
                    <strong>{fighter.record || "-"}</strong>
                  </li>
                  <li>
                    <span>{locale === "ru" ? "Возраст" : "Age"}</span>
                    <strong>{fighter.age ? fighter.age : "-"}</strong>
                  </li>
                  <li>
                    <span>{locale === "ru" ? "Рост" : "Height"}</span>
                    <strong>{fighter.heightCm ? `${fighter.heightCm} см` : "-"}</strong>
                  </li>
                  <li>
                    <span>{locale === "ru" ? "Размах рук" : "Reach"}</span>
                    <strong>{fighter.reachCm ? `${fighter.reachCm} см` : "-"}</strong>
                  </li>
                  <li>
                    <span>{locale === "ru" ? "База" : "Background"}</span>
                    <strong>{fighter.style || "-"}</strong>
                  </li>
                </ul>
              </div>
            ))}
          </div>
          ) : null}

          <ShareButtons url={pageUrl} title={prediction.headline} locale={locale} />
        </article>

        <aside className="stack">
          <div className="policy-card">
            <h3>{locale === "ru" ? "Событие" : "Event"}</h3>
            <p className="copy">
              {[
                fight.event.name,
                new Date(fight.event.date).toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US"),
                formatEventLocation(fight.event.city, fight.event.venue, locale)
              ]
                .map((part) => String(part || "").trim())
                .filter(Boolean)
                .join(" · ")}
            </p>
            <Link href={localizePath(`/events/${fight.event.slug}`, locale)} className="event-table-link">
              {locale === "ru" ? "Открыть карточку турнира" : "Open event card"}
            </Link>
          </div>
          <div className="policy-card">
            <h3>{locale === "ru" ? "Что еще открыть" : "What to open next"}</h3>
            <ul className="event-side-list">
              <li>
                <Link href={localizePath(`/fighters/${fight.fighterA.slug}`, locale)}>{fighterAName}</Link>
              </li>
              <li>
                <Link href={localizePath(`/fighters/${fight.fighterB.slug}`, locale)}>{fighterBName}</Link>
              </li>
              <li>
                <Link href={localizePath(`/events/${fight.event.slug}`, locale)}>{fight.event.name}</Link>
              </li>
            </ul>
          </div>
          <div className="policy-card">
            <h3>{locale === "ru" ? "Разборы и превью" : "Preview coverage"}</h3>
            <ul className="event-side-list">
              {sidebarPredictionLinks.map((article) => (
                <li key={article.id}>
                  <Link href={localizePath(getArticleHref(article.category, article.slug), locale)}>
                    {article.title}
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
