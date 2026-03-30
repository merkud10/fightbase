import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { JsonLd } from "@/components/json-ld";
import { PageHero } from "@/components/page-hero";
import { getFightPredictionPageData } from "@/lib/db";
import { formatWeightClass } from "@/lib/display";
import { getLocale } from "@/lib/i18n";
import { buildLocaleAlternates, localizePath } from "@/lib/locale-path";
import { getSiteUrl } from "@/lib/site";

function parseRecord(record: string | null | undefined) {
  const match = String(record || "").match(/^(\d+)-(\d+)(?:-(\d+))?$/);
  if (!match) {
    return { wins: 0, losses: 0, draws: 0 };
  }

  return {
    wins: Number(match[1]),
    losses: Number(match[2]),
    draws: Number(match[3] || 0)
  };
}

function getDisplayName(
  fighter: { name: string; nameRu?: string | null },
  locale: "ru" | "en"
) {
  return locale === "ru" ? fighter.nameRu ?? fighter.name : fighter.name;
}

function hasUsablePhoto(url?: string | null) {
  return (
    Boolean(url) &&
    !/silhouette|logo_of_the_ultimate_fighting_championship|flag_of_|\/themes\/custom\/ufc\/assets\/img\//i.test(
      String(url)
    )
  );
}

function getWinRate(record: string | null | undefined) {
  const parsed = parseRecord(record);
  const total = parsed.wins + parsed.losses + parsed.draws;
  return total > 0 ? parsed.wins / total : 0;
}

function getPredictionScore(fighter: {
  record: string | null;
  status: string;
  sigStrikesLandedPerMin: number | null;
  strikeAccuracy: number | null;
  strikeDefense: number | null;
  takedownAveragePer15: number | null;
  takedownAccuracy: number | null;
  takedownDefense: number | null;
  submissionAveragePer15: number | null;
}) {
  const winRate = getWinRate(fighter.record);

  return (
    winRate * 50 +
    (fighter.status === "champion" ? 8 : fighter.status === "prospect" ? 3 : 0) +
    (fighter.sigStrikesLandedPerMin ?? 0) * 2 +
    (fighter.strikeAccuracy ?? 0) * 0.2 +
    (fighter.strikeDefense ?? 0) * 0.15 +
    (fighter.takedownAveragePer15 ?? 0) * 3 +
    (fighter.takedownAccuracy ?? 0) * 0.12 +
    (fighter.takedownDefense ?? 0) * 0.12 +
    (fighter.submissionAveragePer15 ?? 0) * 4
  );
}

function buildPredictionCopy(
  locale: "ru" | "en",
  fighterA: Parameters<typeof getPredictionScore>[0] & { name: string; nameRu?: string | null },
  fighterB: Parameters<typeof getPredictionScore>[0] & { name: string; nameRu?: string | null }
) {
  const scoreA = getPredictionScore(fighterA);
  const scoreB = getPredictionScore(fighterB);
  const favorite = scoreA >= scoreB ? fighterA : fighterB;
  const underdog = favorite === fighterA ? fighterB : fighterA;
  const margin = Math.abs(scoreA - scoreB);
  const confidenceLabel =
    margin > 18
      ? locale === "ru"
        ? "уверенное преимущество"
        : "clear edge"
      : margin > 8
        ? locale === "ru"
          ? "умеренное преимущество"
          : "moderate edge"
        : locale === "ru"
          ? "равный бой"
          : "tight matchup";
  const favoriteName = getDisplayName(favorite, locale);
  const underdogName = getDisplayName(underdog, locale);

  return {
    favorite,
    confidenceLabel,
    overview:
      locale === "ru"
        ? `${favoriteName} подходит к этому матчапу с более устойчивой суммой цифр: рекорд, ударная активность и защитные показатели дают ему небольшое, но ощутимое преимущество на дистанции.`
        : `${favoriteName} comes in with the sturdier statistical base. The blend of record, pace, and defense gives this side the more stable projection over three rounds.`,
    keyEdge:
      locale === "ru"
        ? `Главный перевес сейчас у ${favoriteName}: модель видит ${confidenceLabel}, а ${underdogName} нужно ломать ритм, навязывать неудобные размены и забирать бой через смену темпа.`
        : `${favoriteName} owns the key edge for now. The model sees a ${confidenceLabel}, while ${underdogName} needs to disrupt rhythm and force a less comfortable fight.`,
    fightScript:
      locale === "ru"
        ? `Если бой пойдёт в чистом темпе и без резких сдвигов по позициям, преимущество будет медленно смещаться к ${favoriteName}. Для ${underdogName} лучший сценарий — рано забрать инициативу и заставить бой развалиться на отрезки.`
        : `If the fight stays orderly, the edge should slowly tilt toward ${favoriteName}. ${underdogName} has the better chance in a broken rhythm, early momentum swings, and uncomfortable exchanges.`,
    pick:
      locale === "ru"
        ? `Выбор FightBase: ${favoriteName} — ${confidenceLabel}.`
        : `FightBase pick: ${favoriteName} with a ${confidenceLabel}.`
  };
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ eventSlug: string; fightId: string }>;
}): Promise<Metadata> {
  const { eventSlug, fightId } = await params;
  const locale = await getLocale();
  const data = await getFightPredictionPageData(eventSlug, fightId);

  if (!data) {
    return {
      title: locale === "ru" ? "Прогноз не найден" : "Prediction not found"
    };
  }

  const { fight } = data;
  const title = `${fight.fighterA.name} vs ${fight.fighterB.name} — ${locale === "ru" ? "прогноз" : "prediction"}`;

  return {
    title,
    description:
      locale === "ru"
        ? `Прогноз на бой ${fight.fighterA.name} против ${fight.fighterB.name} на турнире ${fight.event.name}.`
        : `Prediction for ${fight.fighterA.name} vs ${fight.fighterB.name} at ${fight.event.name}.`,
    alternates: {
      ...buildLocaleAlternates(`/predictions/${eventSlug}/${fightId}`),
      canonical: localizePath(`/predictions/${eventSlug}/${fightId}`, locale)
    }
  };
}

export default async function FightPredictionPage({
  params
}: {
  params: Promise<{ eventSlug: string; fightId: string }>;
}) {
  const { eventSlug, fightId } = await params;
  const locale = await getLocale();
  const data = await getFightPredictionPageData(eventSlug, fightId);

  if (!data) {
    notFound();
  }

  const { fight, relatedArticles } = data;
  const prediction = buildPredictionCopy(locale, fight.fighterA, fight.fighterB);
  const siteUrl = getSiteUrl();
  const pageUrl = new URL(localizePath(`/predictions/${eventSlug}/${fightId}`, locale), siteUrl).toString();
  const fighterAName = getDisplayName(fight.fighterA, locale);
  const fighterBName = getDisplayName(fight.fighterB, locale);
  const fighterAScore = getPredictionScore(fight.fighterA);
  const fighterBScore = getPredictionScore(fight.fighterB);
  const totalScore = Math.max(fighterAScore + fighterBScore, 1);
  const fighterAPercent = Math.round((fighterAScore / totalScore) * 100);
  const fighterBPercent = 100 - fighterAPercent;
  const breadcrumbItems = [
    { label: locale === "ru" ? "Главная" : "Home", href: "/" },
    { label: locale === "ru" ? "Прогнозы" : "Predictions", href: "/predictions" },
    { label: fight.event.name, href: `/events/${fight.event.slug}` },
    { label: `${fighterAName} vs ${fighterBName}` }
  ];

  return (
    <main className="container">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "SportsEvent",
          name: `${fight.event.name}: ${fight.fighterA.name} vs ${fight.fighterB.name}`,
          url: pageUrl
        }}
      />
      <Breadcrumbs items={breadcrumbItems} locale={locale} />
      <PageHero
        eyebrow={`/predictions/${fight.event.slug}/${fight.id}`}
        title={`${fighterAName} vs ${fighterBName}`}
        description={`${fight.event.promotion.shortName} · ${fight.event.name} · ${formatWeightClass(fight.weightClass, locale)}`}
      />

      <section className="prediction-hero-card">
        <div className="prediction-hero-fighter">
          {hasUsablePhoto(fight.fighterA.photoUrl) ? (
            <img src={String(fight.fighterA.photoUrl)} alt={fighterAName} className="prediction-hero-photo" />
          ) : (
            <div className="prediction-hero-photo prediction-hero-photo--placeholder">{fighterAName.charAt(0)}</div>
          )}
          <div>
            <span className="prediction-hero-label">{locale === "ru" ? "Сторона A" : "Side A"}</span>
            <h3>{fighterAName}</h3>
            <p className="copy">{fight.fighterA.record || "—"}</p>
          </div>
        </div>

        <div className="prediction-hero-center">
          <span className="prediction-label">{locale === "ru" ? "Выбор" : "Pick"}</span>
          <strong>{prediction.pick}</strong>
          <div className="prediction-meter">
            <div className="prediction-meter-fill" style={{ width: `${fighterAPercent}%` }} />
          </div>
          <div className="prediction-meter-scale">
            <span>{fighterAPercent}%</span>
            <span>{fighterBPercent}%</span>
          </div>
        </div>

        <div className="prediction-hero-fighter prediction-hero-fighter--reverse">
          {hasUsablePhoto(fight.fighterB.photoUrl) ? (
            <img src={String(fight.fighterB.photoUrl)} alt={fighterBName} className="prediction-hero-photo" />
          ) : (
            <div className="prediction-hero-photo prediction-hero-photo--placeholder">{fighterBName.charAt(0)}</div>
          )}
          <div>
            <span className="prediction-hero-label">{locale === "ru" ? "Сторона B" : "Side B"}</span>
            <h3>{fighterBName}</h3>
            <p className="copy">{fight.fighterB.record || "—"}</p>
          </div>
        </div>
      </section>

      <section className="detail-grid">
        <article className="table-card prediction-detail-card">
          <div className="prediction-sections prediction-sections--editorial">
            <section className="prediction-section-card">
              <h3>{locale === "ru" ? "Общая картина" : "Matchup overview"}</h3>
              <p className="copy">{prediction.overview}</p>
            </section>
            <section className="prediction-section-card">
              <h3>{locale === "ru" ? "Ключевой перевес" : "Key edge"}</h3>
              <p className="copy">{prediction.keyEdge}</p>
            </section>
            <section className="prediction-section-card">
              <h3>{locale === "ru" ? "Ожидаемый сценарий" : "Likely fight script"}</h3>
              <p className="copy">{prediction.fightScript}</p>
            </section>
          </div>

          <div className="prediction-stats-grid">
            {[fight.fighterA, fight.fighterB].map((fighter) => (
              <div key={fighter.id} className="stat-card prediction-fighter-stat">
                <p className="kicker">{getDisplayName(fighter, locale)}</p>
                <ul className="prediction-stat-list">
                  <li>
                    <span>{locale === "ru" ? "Рекорд" : "Record"}</span>
                    <strong>{fighter.record || "—"}</strong>
                  </li>
                  <li>
                    <span>SLpM</span>
                    <strong>{fighter.sigStrikesLandedPerMin?.toFixed(2) ?? "—"}</strong>
                  </li>
                  <li>
                    <span>{locale === "ru" ? "Точность ударов" : "Strike accuracy"}</span>
                    <strong>{fighter.strikeAccuracy != null ? `${Math.round(fighter.strikeAccuracy)}%` : "—"}</strong>
                  </li>
                  <li>
                    <span>{locale === "ru" ? "Защита в стойке" : "Strike defense"}</span>
                    <strong>{fighter.strikeDefense != null ? `${Math.round(fighter.strikeDefense)}%` : "—"}</strong>
                  </li>
                  <li>
                    <span>{locale === "ru" ? "TD avg" : "TD avg"}</span>
                    <strong>{fighter.takedownAveragePer15?.toFixed(2) ?? "—"}</strong>
                  </li>
                  <li>
                    <span>{locale === "ru" ? "TD defense" : "TD defense"}</span>
                    <strong>{fighter.takedownDefense != null ? `${Math.round(fighter.takedownDefense)}%` : "—"}</strong>
                  </li>
                </ul>
              </div>
            ))}
          </div>
        </article>

        <aside className="stack">
          <div className="policy-card">
            <h3>{locale === "ru" ? "Событие" : "Event"}</h3>
            <p className="copy">
              {fight.event.name} · {new Date(fight.event.date).toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US")} · {fight.event.city}
            </p>
            <Link href={localizePath(`/events/${fight.event.slug}`, locale)} className="event-table-link">
              {locale === "ru" ? "Открыть карточку турнира" : "Open event card"}
            </Link>
          </div>
          <div className="policy-card">
            <h3>{locale === "ru" ? "Что ещё открыть" : "What to open next"}</h3>
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
