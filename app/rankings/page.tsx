import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const revalidate = 3600;

import { FilterSection } from "@/components/filter-section";
import { JsonLd } from "@/components/json-ld";
import { PageHero } from "@/components/page-hero";
import { getUfcOfficialRankingLinks, getUfcRankingSnapshot } from "@/lib/db";
import { formatWeightClass } from "@/lib/display";
import { isPoundForPoundRankingGroup } from "@/lib/ufc-rankings";
import { getLocale } from "@/lib/i18n";
import { getDisplayImageUrl } from "@/lib/image-proxy";
import { buildLocaleAlternates, localizePath } from "@/lib/locale-path";
import { readParam } from "@/lib/search-params";
import { ogImageUrl } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const canonical = localizePath("/rankings", locale);
  const title = locale === "ru" ? "Рейтинги UFC" : "UFC Rankings";
  const description =
    locale === "ru"
      ? "Официальные рейтинги UFC по дивизионам, чемпионам и претендентам."
      : "Official UFC rankings by division, champions, and contenders.";

  return {
    title,
    description,
    alternates: {
      ...buildLocaleAlternates("/rankings"),
      canonical
    },
    openGraph: {
      title,
      description,
      url: canonical,
      images: [ogImageUrl()]
    }
  };
}

type RankingsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RankingsPage({ searchParams }: RankingsPageProps) {
  const locale = await getLocale();
  const siteUrl = getSiteUrl();
  const params = (await searchParams) ?? {};
  const divisionParam = readParam(params.division);
  const [rankingSnapshot, rankingLinks] = await Promise.all([getUfcRankingSnapshot(), getUfcOfficialRankingLinks()]);
  const allGroups = rankingSnapshot?.groups ?? [];
  const fetchedAtLabel = rankingSnapshot
    ? new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Moscow",
        timeZoneName: "short"
      }).format(rankingSnapshot.fetchedAt)
    : null;

  const divisionOptions = allGroups.map((g) => g.title);
  const activeDivision = divisionOptions.includes(divisionParam) ? divisionParam : "";
  const groups = activeDivision ? allGroups.filter((g) => g.title === activeDivision) : allGroups;

  const rankingListElements = groups
    .flatMap((group) =>
      group.rows.slice(0, 5).map((fighter) => ({
        name: fighter.name,
        slug:
          rankingLinks?.bySlug.get(fighter.officialSlug.toLowerCase())?.localSlug ??
          rankingLinks?.byName.get(fighter.name.toLowerCase())?.localSlug
      }))
    )
    .filter((fighter) => fighter.slug)
    .slice(0, 20)
    .map((fighter, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: fighter.name,
      url: new URL(localizePath(`/fighters/${fighter.slug}`, locale), siteUrl).toString()
    }));

  return (
    <main className="container">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "UFC Rankings",
          url: new URL(localizePath("/rankings", locale), siteUrl).toString(),
          inLanguage: locale === "ru" ? "ru-RU" : "en-US"
        }}
      />
      {rankingListElements.length > 0 ? (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: "UFC rankings",
            itemListElement: rankingListElements
          }}
        />
      ) : null}

      <PageHero
        eyebrow="/rankings"
        title={locale === "ru" ? "Рейтинги" : "Rankings"}
        description={
          locale === "ru"
            ? "Официальные рейтинги UFC, а также таблицы по дивизионам с быстрым переходом к профилям бойцов."
            : "Official UFC rankings, plus divisional tables with quick links to fighter profiles."
        }
      />

      <section className="stack">
        <div className="rankings-stack">
          <section className="ranking-intro-card">
            <h2>{locale === "ru" ? "Официальные рейтинги UFC по дивизионам" : "Official UFC divisional rankings"}</h2>
            <p className="table-note">
              {locale === "ru" ? "Источник: " : "Source: "}
              <a href="https://www.ufc.com/rankings" target="_blank" rel="noreferrer">
                UFC.com
              </a>
              {fetchedAtLabel ? (
                <>
                  {locale === "ru" ? " · Обновлено " : " · Updated "}
                  <time dateTime={rankingSnapshot?.fetchedAt.toISOString()}>{fetchedAtLabel}</time>
                  {rankingSnapshot?.isStale
                    ? locale === "ru"
                      ? " · показана последняя сохранённая копия"
                      : " · showing the latest saved copy"
                    : null}
                </>
              ) : null}
            </p>
            <FilterSection
              title={locale === "ru" ? "Дивизион" : "Division"}
              items={divisionOptions.map((d) => ({ value: d, label: formatWeightClass(d, locale) }))}
              activeValue={activeDivision}
              basePath={localizePath("/rankings", locale)}
              current={{ division: activeDivision }}
              param="division"
              allLabel={locale === "ru" ? "Все" : "All"}
            />
          </section>

          {allGroups.length === 0 ? (
            <section className="filter-empty-state">
              <p className="copy">
                {locale === "ru"
                  ? "Сохранённая копия официальных рейтингов UFC пока недоступна. Данные появятся после ближайшего фонового обновления."
                  : "A saved copy of the official UFC rankings is not available yet. Data will appear after the next background refresh."}
              </p>
            </section>
          ) : null}

          {groups.map((group) => {
            const isPoundForPound = isPoundForPoundRankingGroup(group.title);
            const championLink =
              rankingLinks?.bySlug.get(group.champion.officialSlug.toLowerCase()) ??
              rankingLinks?.byName.get(group.champion.name.toLowerCase()) ??
              null;
            const championName = (locale === "ru" ? championLink?.nameRu : null) ?? group.champion.name;

            return (
              <section key={group.title} className="table-card ranking-table-card editorial-card">
                <div className="ranking-table-head">
                  <div className="ranking-head-copy">
                    <h3>{formatWeightClass(group.title, locale)}</h3>
                    <p className="table-note">
                      {locale === "ru"
                        ? `Официальных позиций в таблице: ${group.rows.length}`
                        : `Official ranked positions: ${group.rows.length}`}
                    </p>
                  </div>

                  {isPoundForPound ? null : (
                    <div className="ranking-champion-badge">
                      {championLink?.photoUrl || group.champion.imageUrl ? (
                        <Image
                          src={getDisplayImageUrl(championLink?.photoUrl ?? group.champion.imageUrl)}
                          alt={championName}
                          className="ranking-champion-photo"
                          width={120}
                          height={120}
                          sizes="120px"
                          loading="lazy"
                        />
                      ) : null}
                      <span>{locale === "ru" ? "Чемпион дивизиона" : "Division champion"}</span>
                      <strong>{championName}</strong>
                      {championLink?.localSlug ? (
                        <Link href={localizePath(`/fighters/${championLink.localSlug}`, locale)}>
                          {locale === "ru" ? "Открыть профиль" : "Open profile"}
                        </Link>
                      ) : (
                        <span className="table-note">{locale === "ru" ? "Профиль ожидается" : "Profile pending"}</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="table-wrap">
                  <table className="ranking-table">
                    <caption className="sr-only">
                      {locale === "ru"
                        ? `Рейтинг UFC: ${formatWeightClass(group.title, locale)}`
                        : `UFC ranking: ${formatWeightClass(group.title, locale)}`}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">#</th>
                        <th scope="col">{locale === "ru" ? "Боец" : "Fighter"}</th>
                        <th scope="col">{locale === "ru" ? "Профиль" : "Profile"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((fighter) => {
                        const link =
                          rankingLinks?.bySlug.get(fighter.officialSlug.toLowerCase()) ??
                          rankingLinks?.byName.get(fighter.name.toLowerCase()) ??
                          null;
                        const fighterName = (locale === "ru" ? link?.nameRu : null) ?? fighter.name;

                        return (
                          <tr key={`${group.title}-${fighter.rank}`} className="ranking-row">
                            <td>{fighter.rank}</td>
                            <td>
                              <div className="ranking-fighter-cell">
                                {link?.photoUrl ? (
                                  <Image
                                    src={getDisplayImageUrl(link.photoUrl)}
                                    alt={fighterName}
                                    className="ranking-fighter-photo"
                                    width={52}
                                    height={52}
                                    sizes="52px"
                                    loading="lazy"
                                  />
                                ) : (
                                  <div className="ranking-fighter-photo ranking-fighter-photo--placeholder" aria-hidden="true">
                                    {fighterName.charAt(0)}
                                  </div>
                                )}
                                <div className="ranking-fighter-copy">
                                  <strong>{fighterName}</strong>
                                  <span>UFC</span>
                                </div>
                              </div>
                            </td>
                            <td>
                              {link?.localSlug ? (
                                <Link href={localizePath(`/fighters/${link.localSlug}`, locale)}>
                                  {locale === "ru" ? "Открыть" : "Open"}
                                </Link>
                              ) : (
                                <span className="table-note">{locale === "ru" ? "Ожидается" : "Pending"}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      </section>
    </main>
  );
}
