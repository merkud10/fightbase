import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

export const revalidate = 3600;

import { Breadcrumbs } from "@/components/breadcrumbs";
import { JsonLd } from "@/components/json-ld";
import { PageHero } from "@/components/page-hero";
import { getRankingFighterDetails, getUfcOfficialRankingLinks, getUfcRankingSnapshot } from "@/lib/db";
import { getLocale } from "@/lib/i18n";
import { getDisplayImageUrl } from "@/lib/image-proxy";
import { localizePath } from "@/lib/locale-path";
import { findRankingDivision, getRankingDivisionBySlug, RANKING_DIVISIONS, type RankingDivision } from "@/lib/ranking-divisions";
import { ogImageUrl } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site";
import { buildTrailBreadcrumbJsonLd } from "@/lib/structured-data";

type DivisionPageProps = {
  params: Promise<{ division: string }>;
};

type RankingLinks = Awaited<ReturnType<typeof getUfcOfficialRankingLinks>>;

async function loadDivision(slug: string) {
  const division = getRankingDivisionBySlug(slug);
  if (!division) return null;

  const snapshot = await getUfcRankingSnapshot();
  const group = snapshot?.groups.find((item) => findRankingDivision(item.title)?.slug === division.slug);
  if (!snapshot || !group) return null;

  const available = RANKING_DIVISIONS.filter((item) =>
    snapshot.groups.some((candidate) => findRankingDivision(candidate.title)?.slug === item.slug)
  );

  return { division, group, snapshot, available };
}

function resolveLink(links: RankingLinks | null, officialSlug: string, name: string) {
  return links?.bySlug.get(officialSlug.toLowerCase()) ?? links?.byName.get(name.toLowerCase()) ?? null;
}

function pageTitle(division: RankingDivision) {
  return division.poundForPound
    ? `Рейтинг UFC (ЮФС) ${division.ruIn}: лучшие бойцы`
    : `Рейтинг UFC (ЮФС) ${division.ruIn}: чемпион и топ-15 бойцов`;
}

export async function generateMetadata({ params }: DivisionPageProps): Promise<Metadata> {
  const { division: slug } = await params;
  const locale = await getLocale();
  const data = await loadDivision(slug);
  if (!data) return {};

  const { division, group } = data;
  const links = await getUfcOfficialRankingLinks();
  const name = (officialSlug: string, fallback: string) => resolveLink(links, officialSlug, fallback)?.nameRu ?? fallback;
  const top = group.rows
    .slice(0, 3)
    .map((row) => `${row.rank}. ${name(row.officialSlug, row.name)}`)
    .join(", ");
  const title = pageTitle(division);
  const description = division.poundForPound
    ? `Официальный рейтинг UFC ${division.ruIn}: ${top} и остальной топ-15 с профилями, рекордами и ближайшими боями.`
    : `Официальный рейтинг UFC ${division.ruIn}: чемпион ${name(group.champion.officialSlug, group.champion.name)}, ${top} и весь топ-15 с рекордами и ближайшими боями. Обновляется после каждого турнира.`;
  const canonical = localizePath(`/rankings/${division.slug}`, locale);

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, images: [ogImageUrl()] }
  };
}

export default async function RankingDivisionPage({ params }: DivisionPageProps) {
  const { division: slug } = await params;
  const locale = await getLocale();
  const data = await loadDivision(slug);
  if (!data) notFound();

  const { division, group, snapshot, available } = data;
  const links = await getUfcOfficialRankingLinks();
  const siteUrl = getSiteUrl();
  const pageUrl = new URL(localizePath(`/rankings/${division.slug}`, locale), siteUrl).toString();
  const breadcrumbItems = [
    { label: "Главная", href: "/" },
    { label: "Рейтинги", href: "/rankings" },
    { label: division.ruTitle }
  ];

  const championLink = division.poundForPound ? null : resolveLink(links, group.champion.officialSlug, group.champion.name);
  const championName = championLink?.nameRu ?? group.champion.name;
  const rows = group.rows.map((row) => {
    const link = resolveLink(links, row.officialSlug, row.name);
    return { ...row, link, displayName: link?.nameRu ?? row.name };
  });
  const details = await getRankingFighterDetails(
    [championLink?.localSlug, ...rows.map((row) => row.link?.localSlug)].filter((value): value is string => Boolean(value))
  );
  const championDetails = championLink?.localSlug ? details.get(championLink.localSlug) : undefined;
  // Бой двух бойцов из топа показываем один раз — у старшего по позиции.
  const seenFights = new Set<string>();
  const upcoming = rows.filter((row) => {
    const next = row.link?.localSlug ? details.get(row.link.localSlug)?.nextFight : null;
    if (!next) return false;
    const key = next.fightSlug ?? `${next.eventSlug}:${[row.link?.localSlug, next.opponentSlug].sort().join(":")}`;
    if (seenFights.has(key)) return false;
    seenFights.add(key);
    return true;
  });
  const updatedLabel = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Moscow" }).format(
    snapshot.fetchedAt
  );
  const dateLabel = (date: Date) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" }).format(date);

  return (
    <main className="container">
      <JsonLd data={buildTrailBreadcrumbJsonLd(breadcrumbItems, { locale, siteUrl, currentUrl: pageUrl })} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: pageTitle(division),
          url: pageUrl,
          itemListElement: rows
            .filter((row) => row.link?.localSlug)
            .map((row) => ({
              "@type": "ListItem",
              position: row.rank,
              name: row.displayName,
              url: new URL(localizePath(`/fighters/${row.link?.localSlug}`, locale), siteUrl).toString()
            }))
        }}
      />

      <Breadcrumbs items={breadcrumbItems} locale={locale} />
      <PageHero
        eyebrow="/rankings"
        title={pageTitle(division)}
        description={`Официальный рейтинг UFC ${division.ruIn} по данным UFC.com на ${updatedLabel}. Каждая строка ведёт в профиль бойца: рекорд, статистика, история боёв и прогноз на ближайший бой.`}
      />

      <section className="stack">
        <div className="rankings-stack">
          <nav className="ranking-intro-card" aria-label="Дивизионы">
            <h2>Весовые категории</h2>
            <p className="copy">
              <Link href={localizePath("/rankings", locale)}>Все дивизионы</Link>
              {available.map((item) => (
                <span key={item.slug}>
                  {" · "}
                  {item.slug === division.slug ? (
                    <strong>{item.ruTitle}</strong>
                  ) : (
                    <Link href={localizePath(`/rankings/${item.slug}`, locale)}>{item.ruTitle}</Link>
                  )}
                </span>
              ))}
            </p>
          </nav>

          {championLink || (!division.poundForPound && group.champion.name) ? (
            <section className="policy-card" aria-label="Чемпион дивизиона">
              <p className="kicker">Чемпион UFC {division.ruIn}</p>
              <p className="copy">
                {championLink?.localSlug ? (
                  <Link href={localizePath(`/fighters/${championLink.localSlug}`, locale)}>{championName}</Link>
                ) : (
                  championName
                )}
                {championDetails ? ` · ${championDetails.record} · ${championDetails.country}` : null}
                {championDetails?.nextFight
                  ? ` · следующий бой: ${championDetails.nextFight.opponentNameRu ?? championDetails.nextFight.opponentName}, ${dateLabel(championDetails.nextFight.date)}`
                  : null}
              </p>
            </section>
          ) : null}

          <section className="table-card ranking-table-card editorial-card">
            <div className="ranking-table-head">
              <div className="ranking-head-copy">
                <h2>{`Топ-${rows.length} UFC ${division.ruIn}`}</h2>
                <p className="table-note">
                  Источник:{" "}
                  <a href="https://www.ufc.com/rankings" target="_blank" rel="noreferrer">
                    UFC.com
                  </a>{" "}
                  · обновлено {updatedLabel}
                </p>
              </div>
            </div>
            <div className="table-wrap">
              <table className="ranking-table">
                <caption className="sr-only">{pageTitle(division)}</caption>
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Боец</th>
                    <th scope="col">Рекорд</th>
                    <th scope="col">Ближайший бой</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const info = row.link?.localSlug ? details.get(row.link.localSlug) : undefined;
                    const next = info?.nextFight;

                    return (
                      <tr key={`${row.rank}-${row.officialSlug}`} className="ranking-row">
                        <td>{row.rank}</td>
                        <td>
                          <div className="ranking-fighter-cell">
                            {row.link?.photoUrl ? (
                              <Image
                                src={getDisplayImageUrl(row.link.photoUrl)}
                                alt={row.displayName}
                                className="ranking-fighter-photo"
                                width={52}
                                height={52}
                                loading="lazy"
                              />
                            ) : (
                              <div className="ranking-fighter-photo ranking-fighter-photo--placeholder" aria-hidden="true">
                                {row.displayName.charAt(0)}
                              </div>
                            )}
                            <div className="ranking-fighter-copy">
                              {row.link?.localSlug ? (
                                <Link href={localizePath(`/fighters/${row.link.localSlug}`, locale)}>
                                  <strong>{row.displayName}</strong>
                                </Link>
                              ) : (
                                <strong>{row.displayName}</strong>
                              )}
                              <span>{info?.country ?? "UFC"}</span>
                            </div>
                          </div>
                        </td>
                        <td>{info?.record ?? "—"}</td>
                        <td>
                          {next ? (
                            <Link
                              href={localizePath(
                                next.fightSlug ? `/predictions/${next.eventSlug}/${next.fightSlug}` : `/events/${next.eventSlug}`,
                                locale
                              )}
                            >
                              {next.opponentNameRu ?? next.opponentName}, {dateLabel(next.date)}
                            </Link>
                          ) : (
                            <span className="table-note">не назначен</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {upcoming.length > 0 ? (
            <section className="policy-card">
              <h2>Ближайшие бои топ-15 {division.ruIn}</h2>
              <ul>
                {upcoming.map((row) => {
                  const next = row.link?.localSlug ? details.get(row.link.localSlug)?.nextFight : null;
                  if (!next) return null;
                  return (
                    <li key={row.officialSlug}>
                      №{row.rank} {row.displayName} — {next.opponentNameRu ?? next.opponentName}, {next.eventName}, {dateLabel(next.date)}
                      {next.fightSlug ? (
                        <>
                          {" · "}
                          <Link href={localizePath(`/predictions/${next.eventSlug}/${next.fightSlug}`, locale)}>прогноз</Link>
                        </>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}
