import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const revalidate = 3600;

import { Breadcrumbs } from "@/components/breadcrumbs";
import { JsonLd } from "@/components/json-ld";
import { PageHero } from "@/components/page-hero";
import { getRankingFighterDetails, getUfcOfficialRankingLinks, getUfcRankingSnapshot } from "@/lib/db";
import { getLocale } from "@/lib/i18n";
import { getDisplayImageUrl } from "@/lib/image-proxy";
import { localizePath } from "@/lib/locale-path";
import { ogImageUrl } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site";
import { buildTrailBreadcrumbJsonLd } from "@/lib/structured-data";
import { buildChampionList, type UfcChampion } from "@/lib/ufc-champions";

// Под запросы «чемпионы юфс» (~10 тыс. в месяц) и «чемпионы ufc» (~5 тыс.) по
// Вордстату на октябрь 2026; заголовки карточек — под «кто сейчас чемпион ufc в
// тяжелом весе» и «российские чемпионы ufc».
const TITLE = "Чемпионы UFC (ЮФС) на сегодня: все действующие чемпионы по весовым категориям";

type RankingLinks = Awaited<ReturnType<typeof getUfcOfficialRankingLinks>>;

function resolveLink(links: RankingLinks | null, champion: UfcChampion["champion"]) {
  return links?.bySlug.get(champion.officialSlug.toLowerCase()) ?? links?.byName.get(champion.name.toLowerCase()) ?? null;
}

function formatUpdated(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Moscow" }).format(date);
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const snapshot = await getUfcRankingSnapshot();
  const links = await getUfcOfficialRankingLinks();
  const champions = snapshot ? buildChampionList(snapshot.groups).filter((item) => !item.vacant) : [];
  const sample = champions
    .slice(0, 4)
    .map((item) => `${resolveLink(links, item.champion)?.nameRu ?? item.champion.name} (${item.division.ruTitle.toLowerCase()})`)
    .join(", ");
  const description = snapshot
    ? `Все действующие чемпионы UFC на ${formatUpdated(snapshot.fetchedAt)}: ${sample} и остальные — с рекордом, местом в P4P и ближайшей защитой титула. Российские чемпионы UFC отдельным списком.`
    : "Все действующие чемпионы UFC по весовым категориям с рекордом и ближайшей защитой титула.";
  const canonical = localizePath("/champions", locale);

  return {
    title: TITLE,
    description,
    alternates: { canonical },
    openGraph: { title: TITLE, description, url: canonical, images: [ogImageUrl()] }
  };
}

export default async function ChampionsPage() {
  const locale = await getLocale();
  const snapshot = await getUfcRankingSnapshot();
  const links = await getUfcOfficialRankingLinks();
  const champions = snapshot ? buildChampionList(snapshot.groups) : [];
  const resolved = champions.map((item) => {
    const link = item.vacant ? null : resolveLink(links, item.champion);
    return { ...item, link, displayName: link?.nameRu ?? item.champion.name };
  });
  const details = await getRankingFighterDetails(
    resolved.map((item) => item.link?.localSlug).filter((value): value is string => Boolean(value))
  );
  const russian = resolved.filter((item) => item.link?.localSlug && details.get(item.link.localSlug)?.country === "Россия");
  const siteUrl = getSiteUrl();
  const pageUrl = new URL(localizePath("/champions", locale), siteUrl).toString();
  const breadcrumbItems = [
    { label: "Главная", href: "/" },
    { label: "Рейтинги", href: "/rankings" },
    { label: "Чемпионы UFC" }
  ];
  const dateLabel = (date: Date) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" }).format(date);

  return (
    <main className="container">
      <JsonLd data={buildTrailBreadcrumbJsonLd(breadcrumbItems, { locale, siteUrl, currentUrl: pageUrl })} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: TITLE,
          url: pageUrl,
          itemListElement: resolved
            .filter((item) => item.link?.localSlug)
            .map((item, index) => ({
              "@type": "ListItem",
              position: index + 1,
              name: `${item.displayName} — чемпион UFC ${item.division.ruIn}`,
              url: new URL(localizePath(`/fighters/${item.link?.localSlug}`, locale), siteUrl).toString()
            }))
        }}
      />

      <Breadcrumbs items={breadcrumbItems} locale={locale} />
      <PageHero
        eyebrow="/champions"
        title="Чемпионы UFC (ЮФС) на сегодня"
        description={
          snapshot
            ? `Все действующие чемпионы UFC по весовым категориям на ${formatUpdated(snapshot.fetchedAt)} по официальному рейтингу UFC.com: рекорд, место в рейтинге P4P и ближайшая защита пояса. Обновляется после каждого турнира.`
            : "Все действующие чемпионы UFC по весовым категориям по официальному рейтингу UFC.com."
        }
      />

      <section className="stack">
        {resolved.length === 0 ? (
          <section className="filter-empty-state">
            <p className="copy">Сохранённая копия официального рейтинга UFC пока недоступна. Список чемпионов появится после ближайшего обновления.</p>
          </section>
        ) : (
          <div className="champions-grid">
            {resolved.map((item) => {
              const info = item.link?.localSlug ? details.get(item.link.localSlug) : undefined;
              const next = info?.nextFight;
              return (
                <section key={item.division.slug} className="policy-card champion-card">
                  <h2>Чемпион UFC {item.division.ruIn}</h2>
                  {item.vacant ? (
                    <p className="copy">Титул вакантен.</p>
                  ) : (
                    <div className="ranking-fighter-cell">
                      {item.link?.photoUrl ? (
                        <Image
                          src={getDisplayImageUrl(item.link.photoUrl)}
                          alt={item.displayName}
                          className="ranking-fighter-photo"
                          width={52}
                          height={52}
                          loading="lazy"
                        />
                      ) : (
                        <div className="ranking-fighter-photo ranking-fighter-photo--placeholder" aria-hidden="true">
                          {item.displayName.charAt(0)}
                        </div>
                      )}
                      <div className="ranking-fighter-copy">
                        {item.link?.localSlug ? (
                          <Link href={localizePath(`/fighters/${item.link.localSlug}`, locale)}>
                            <strong>{item.displayName}</strong>
                          </Link>
                        ) : (
                          <strong>{item.displayName}</strong>
                        )}
                        <span>{[info?.record, info?.country].filter(Boolean).join(" · ") || "UFC"}</span>
                      </div>
                    </div>
                  )}
                  {item.p4pRank ? (
                    <p className="table-note">
                      №{item.p4pRank} в рейтинге P4P{item.division.slug.startsWith("womens-") ? " среди женщин" : ""}
                    </p>
                  ) : null}
                  {next ? (
                    <p className="copy">
                      Следующий бой:{" "}
                      <Link
                        href={localizePath(next.fightSlug ? `/predictions/${next.eventSlug}/${next.fightSlug}` : `/events/${next.eventSlug}`, locale)}
                      >
                        {next.opponentNameRu ?? next.opponentName}, {next.eventName}, {dateLabel(next.date)}
                      </Link>
                    </p>
                  ) : null}
                  <Link href={localizePath(`/rankings/${item.division.slug}`, locale)} className="event-table-link">
                    Топ-15 {item.division.ruIn} →
                  </Link>
                </section>
              );
            })}
          </div>
        )}

        {russian.length > 0 ? (
          <section className="policy-card">
            <h2>Российские чемпионы UFC</h2>
            <ul>
              {russian.map((item) => (
                <li key={item.division.slug}>
                  <Link href={localizePath(`/fighters/${item.link?.localSlug}`, locale)}>{item.displayName}</Link> — чемпион{" "}
                  {item.division.ruIn}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <p className="table-note">
          Источник:{" "}
          <a href="https://www.ufc.com/rankings" target="_blank" rel="noreferrer">
            UFC.com
          </a>
          {snapshot ? ` · обновлено ${formatUpdated(snapshot.fetchedAt)}` : ""} ·{" "}
          <Link href={localizePath("/rankings", locale)}>рейтинг UFC по всем весовым категориям</Link>
        </p>
      </section>
    </main>
  );
}
