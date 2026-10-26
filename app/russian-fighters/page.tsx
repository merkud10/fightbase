import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const revalidate = 3600;

import { Breadcrumbs } from "@/components/breadcrumbs";
import { JsonLd } from "@/components/json-ld";
import { PageHero } from "@/components/page-hero";
import { getRankingFighterDetails, getRussianFightersHubData, getUfcOfficialRankingLinks, getUfcRankingSnapshot } from "@/lib/db";
import { getDisplayName } from "@/lib/display";
import { getLocale } from "@/lib/i18n";
import { getDisplayImageUrl } from "@/lib/image-proxy";
import { localizePath } from "@/lib/locale-path";
import { findRankingDivision } from "@/lib/ranking-divisions";
import { buildRussianFightersHub, type FighterRanking } from "@/lib/russian-fighters";
import { ogImageUrl } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site";
import { buildTrailBreadcrumbJsonLd } from "@/lib/structured-data";

type RankingLinks = Awaited<ReturnType<typeof getUfcOfficialRankingLinks>>;

// Места в официальном рейтинге по локальному слагу бойца: чемпион и топ-15
// каждого дивизиона (P4P и пустые дубли групп из снимка ufc.ru не берём).
async function loadRankings(): Promise<Map<string, FighterRanking>> {
  const [snapshot, links] = await Promise.all([getUfcRankingSnapshot(), getUfcOfficialRankingLinks()]);
  const rankings = new Map<string, FighterRanking>();
  if (!snapshot) return rankings;
  const localSlug = (links: RankingLinks, officialSlug: string, name: string) =>
    links?.bySlug.get(officialSlug.toLowerCase())?.localSlug ?? links?.byName.get(name.toLowerCase())?.localSlug;
  const seen = new Set<string>();
  for (const group of snapshot.groups) {
    const division = findRankingDivision(group.title);
    if (!division || division.poundForPound || seen.has(division.slug)) continue;
    seen.add(division.slug);
    const champion = localSlug(links, group.champion.officialSlug, group.champion.name);
    if (champion) rankings.set(champion, { division, rank: null });
    for (const row of group.rows) {
      const slug = localSlug(links, row.officialSlug, row.name);
      if (slug && !rankings.has(slug)) rankings.set(slug, { division, rank: row.rank });
    }
  }
  return rankings;
}

function fightersWord(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "российский боец";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "российских бойца";
  return "российских бойцов";
}

const TITLE = "Российские бойцы UFC (ЮФС) 2026: все россияне в UFC, рейтинг и ближайшие бои";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const hub = buildRussianFightersHub(await getRussianFightersHubData(), await loadRankings());
  const champions = hub.champions.map((item) => getDisplayName(item.fighter, "ru")).join(" и ");
  const description = `Сейчас в UFC выступают ${hub.activeCount} ${fightersWord(hub.activeCount)}${champions ? `, чемпионы — ${champions}` : ""}. Полный список россиян в UFC по весовым категориям: рекорды, места в рейтинге и ближайшие бои.`;
  const canonical = localizePath("/russian-fighters", locale);
  return { title: TITLE, description, alternates: { canonical }, openGraph: { title: TITLE, description, url: canonical, images: [ogImageUrl()] } };
}

export default async function RussianFightersPage() {
  const locale = await getLocale();
  const hub = buildRussianFightersHub(await getRussianFightersHubData(), await loadRankings());
  const activeSlugs = hub.divisions.flatMap((group) => group.fighters.map((item) => item.fighter.slug));
  const details = await getRankingFighterDetails(activeSlugs);
  const upcoming = hub.divisions
    .flatMap((group) => group.fighters)
    .map((item) => ({ item, next: details.get(item.fighter.slug)?.nextFight ?? null }))
    .filter((entry): entry is { item: (typeof entry)["item"]; next: NonNullable<(typeof entry)["next"]> } => Boolean(entry.next))
    .sort((left, right) => left.next.date.getTime() - right.next.date.getTime());
  const siteUrl = getSiteUrl();
  const pageUrl = new URL(localizePath("/russian-fighters", locale), siteUrl).toString();
  const breadcrumbItems = [
    { label: "Главная", href: "/" },
    { label: "Бойцы", href: "/fighters" },
    { label: "Российские бойцы UFC" }
  ];
  const dateLabel = (date: Date) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" }).format(date);
  const rankLabel = (ranking: FighterRanking | undefined) =>
    ranking ? (ranking.rank === null ? `чемпион ${ranking.division.ruIn}` : `№${ranking.rank} ${ranking.division.ruIn}`) : null;

  return (
    <main className="container">
      <JsonLd data={buildTrailBreadcrumbJsonLd(breadcrumbItems, { locale, siteUrl, currentUrl: pageUrl })} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "Российские бойцы UFC",
          url: pageUrl,
          itemListElement: activeSlugs.map((slug, index) => ({
            "@type": "ListItem",
            position: index + 1,
            url: new URL(localizePath(`/fighters/${slug}`, locale), siteUrl).toString()
          }))
        }}
      />

      <Breadcrumbs items={breadcrumbItems} locale={locale} />
      <PageHero
        eyebrow="/russian-fighters"
        title="Российские бойцы в UFC (ЮФС)"
        description={`Сейчас в UFC выступают ${hub.activeCount} ${fightersWord(hub.activeCount)}. Ниже — все по весовым категориям: рекорд, место в официальном рейтинге UFC и ближайший бой, а также чемпионы и россияне, завершившие карьеру.`}
      />

      <section className="stack">
        {hub.champions.length > 0 ? (
          <section className="policy-card">
            <h2>Российские чемпионы UFC</h2>
            <ul>
              {hub.champions.map((item) => (
                <li key={item.fighter.slug}>
                  <Link href={localizePath(`/fighters/${item.fighter.slug}`, locale)}>{getDisplayName(item.fighter, locale)}</Link> — чемпион{" "}
                  {item.ranking?.division.ruIn}
                </li>
              ))}
            </ul>
            <Link href={localizePath("/champions", locale)} className="event-table-link">
              Все чемпионы UFC →
            </Link>
          </section>
        ) : null}

        {upcoming.length > 0 ? (
          <section className="policy-card">
            <h2>Ближайшие бои российских бойцов в UFC</h2>
            <ul>
              {upcoming.map(({ item, next }) => (
                <li key={item.fighter.slug}>
                  <strong>{getDisplayName(item.fighter, locale)}</strong> — {next.opponentNameRu ?? next.opponentName}, {next.eventName},{" "}
                  {dateLabel(next.date)}
                  {next.fightSlug ? (
                    <>
                      {" · "}
                      <Link href={localizePath(`/predictions/${next.eventSlug}/${next.fightSlug}`, locale)}>прогноз</Link>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {hub.divisions.map((group) => (
          <section key={group.division?.slug ?? "other"} className="table-card editorial-card">
            <h2>{group.division ? `Россияне в UFC ${group.division.ruIn}` : "Другие весовые категории"}</h2>
            <div className="table-wrap">
              <table className="ranking-table">
                <thead>
                  <tr>
                    <th scope="col">Боец</th>
                    <th scope="col">Рекорд</th>
                    <th scope="col">Ближайший бой</th>
                  </tr>
                </thead>
                <tbody>
                  {group.fighters.map(({ fighter, ranking }) => {
                    const next = details.get(fighter.slug)?.nextFight;
                    const displayName = getDisplayName(fighter, locale);
                    return (
                      <tr key={fighter.slug} className="ranking-row">
                        <td>
                          <div className="ranking-fighter-cell">
                            {fighter.photoUrl ? (
                              <Image
                                src={getDisplayImageUrl(fighter.photoUrl)}
                                alt={displayName}
                                className="ranking-fighter-photo"
                                width={52}
                                height={52}
                                loading="lazy"
                              />
                            ) : (
                              <div className="ranking-fighter-photo ranking-fighter-photo--placeholder" aria-hidden="true">
                                {displayName.charAt(0)}
                              </div>
                            )}
                            <div className="ranking-fighter-copy">
                              <Link href={localizePath(`/fighters/${fighter.slug}`, locale)}>
                                <strong>{displayName}</strong>
                              </Link>
                              <span>{rankLabel(ranking) ?? "вне топ-15"}</span>
                            </div>
                          </div>
                        </td>
                        <td>{fighter.record || "—"}</td>
                        <td>
                          {next ? (
                            <Link
                              href={localizePath(next.fightSlug ? `/predictions/${next.eventSlug}/${next.fightSlug}` : `/events/${next.eventSlug}`, locale)}
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
            {group.division ? (
              <Link href={localizePath(`/rankings/${group.division.slug}`, locale)} className="event-table-link">
                Рейтинг UFC {group.division.ruIn} →
              </Link>
            ) : null}
          </section>
        ))}

        {hub.retired.length > 0 ? (
          <section className="policy-card">
            <h2>Российские бойцы UFC, завершившие карьеру</h2>
            <p className="copy">
              {hub.retired.map((fighter, index) => (
                <span key={fighter.slug}>
                  {index > 0 ? ", " : ""}
                  <Link href={localizePath(`/fighters/${fighter.slug}`, locale)}>{getDisplayName(fighter, locale)}</Link>
                </span>
              ))}
            </p>
          </section>
        ) : null}

        <p className="table-note">
          Страна — по данным ESPN, с поправкой для бойцов, которые выступают в UFC за другую страну.{" "}
          <Link href={localizePath("/rankings", locale)}>Рейтинг UFC по всем весовым категориям</Link>
        </p>
      </section>
    </main>
  );
}
