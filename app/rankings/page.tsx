import type { Metadata } from "next";
import Link from "next/link";

import { FilterSection } from "@/components/filter-section";
import { JsonLd } from "@/components/json-ld";
import { PageHero } from "@/components/page-hero";
import { getUfcOfficialRankingLinks } from "@/lib/db";
import { formatWeightClass } from "@/lib/display";
import { getLocale } from "@/lib/i18n";
import { buildLocaleAlternates, localizePath } from "@/lib/locale-path";
import { readParam } from "@/lib/search-params";
import { getSiteUrl } from "@/lib/site";
import { fetchUfcOfficialRankings } from "@/lib/ufc-rankings";

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
      url: canonical
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
  const [allGroups, rankingLinks] = await Promise.all([fetchUfcOfficialRankings(), getUfcOfficialRankingLinks()]);

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
      url: new URL(`/fighters/${fighter.slug}`, siteUrl).toString()
    }));

  return (
    <main className="container">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "UFC Rankings",
          url: new URL("/rankings", siteUrl).toString(),
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

          {groups.map((group) => {
            const championLink =
              rankingLinks?.bySlug.get(group.champion.officialSlug.toLowerCase()) ??
              rankingLinks?.byName.get(group.champion.name.toLowerCase()) ??
              null;

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

                  <div className="ranking-champion-badge">
                    {championLink?.photoUrl || group.champion.imageUrl ? (
                      <img
                        src={championLink?.photoUrl ?? group.champion.imageUrl ?? ""}
                        alt={group.champion.name}
                        className="ranking-champion-photo"
                        loading="lazy"
                      />
                    ) : null}
                    <span>{locale === "ru" ? "Чемпион дивизиона" : "Division champion"}</span>
                    <strong>{group.champion.name}</strong>
                    {championLink?.localSlug ? (
                      <Link href={localizePath(`/fighters/${championLink.localSlug}`, locale)}>
                        {locale === "ru" ? "Открыть профиль" : "Open profile"}
                      </Link>
                    ) : (
                      <span className="table-note">{locale === "ru" ? "Профиль ожидается" : "Profile pending"}</span>
                    )}
                  </div>
                </div>

                <div className="table-wrap">
                  <table className="ranking-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>{locale === "ru" ? "Боец" : "Fighter"}</th>
                        <th>{locale === "ru" ? "Профиль" : "Profile"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((fighter) => {
                        const link =
                          rankingLinks?.bySlug.get(fighter.officialSlug.toLowerCase()) ??
                          rankingLinks?.byName.get(fighter.name.toLowerCase()) ??
                          null;

                        return (
                          <tr key={`${group.title}-${fighter.rank}`} className="ranking-row">
                            <td>{fighter.rank + 1}</td>
                            <td>
                              <div className="ranking-fighter-cell">
                                {link?.photoUrl ? (
                                  <img
                                    src={link.photoUrl}
                                    alt={fighter.name}
                                    className="ranking-fighter-photo"
                                    loading="lazy"
                                  />
                                ) : (
                                  <div className="ranking-fighter-photo ranking-fighter-photo--placeholder" aria-hidden="true">
                                    {fighter.name.charAt(0)}
                                  </div>
                                )}
                                <div className="ranking-fighter-copy">
                                  <strong>{fighter.name}</strong>
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
