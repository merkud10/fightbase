import Link from "next/link";

import { PageHero } from "@/components/page-hero";
import { getPromotionRankingsPageData, getPromotionRankingLinks, getUfcOfficialRankingLinks } from "@/lib/db";
import { formatFighterStatus, formatWeightClass } from "@/lib/display";
import { getLocale } from "@/lib/i18n";
import { fetchPflOfficialRankings } from "@/lib/pfl-rankings";
import { fetchUfcOfficialRankings } from "@/lib/ufc-rankings";

type RankingsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type PromotionRankingLinks = Awaited<ReturnType<typeof getPromotionRankingLinks>>;

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function buildPromotionHref(promotion: string) {
  return promotion ? `/rankings?promotion=${promotion}` : "/rankings";
}

function normalizeRankingName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-zа-я0-9\s-]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getNameTokens(value: string) {
  return normalizeRankingName(value)
    .split(/\s+/)
    .filter(Boolean);
}

function getLastToken(value: string) {
  const tokens = getNameTokens(value);
  return tokens[tokens.length - 1] ?? "";
}

function getFirstToken(value: string) {
  const tokens = getNameTokens(value);
  return tokens[0] ?? "";
}

function getEditDistance(left: string, right: string) {
  if (left === right) {
    return 0;
  }

  if (!left.length) {
    return right.length;
  }

  if (!right.length) {
    return left.length;
  }

  const matrix = Array.from({ length: left.length + 1 }, () => new Array<number>(right.length + 1).fill(0));

  for (let row = 0; row <= left.length; row += 1) {
    matrix[row][0] = row;
  }

  for (let column = 0; column <= right.length; column += 1) {
    matrix[0][column] = column;
  }

  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;

      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost
      );
    }
  }

  return matrix[left.length][right.length];
}

function namesLookClose(left: string, right: string) {
  if (!left || !right) {
    return false;
  }

  if (left === right) {
    return true;
  }

  if (left.startsWith(right) || right.startsWith(left)) {
    return Math.min(left.length, right.length) >= 4;
  }

  return getEditDistance(left, right) <= 2;
}

function findPromotionRankingLink(name: string, rankingLinks: PromotionRankingLinks | null) {
  if (!rankingLinks) {
    return null;
  }

  const normalizedName = normalizeRankingName(name);
  const direct = rankingLinks.byName.get(name.toLowerCase()) ?? rankingLinks.byName.get(normalizedName);

  if (direct) {
    return direct;
  }

  const targetLast = getLastToken(name);
  const targetFirst = getFirstToken(name);

  if (!targetLast) {
    return null;
  }

  const candidates = rankingLinks.entries.filter((entry) => {
    const entryLast = getLastToken(entry.name);
    return entryLast && entryLast === targetLast;
  });

  if (!candidates.length) {
    return null;
  }

  const bestCandidate = candidates
    .map((entry) => ({
      entry,
      score: (() => {
        const entryFirst = getFirstToken(entry.name);
        const entryNormalized = normalizeRankingName(entry.name);

        if (entryNormalized === normalizedName) {
          return 100;
        }

        if (namesLookClose(entryFirst, targetFirst)) {
          return 80 - getEditDistance(entryFirst, targetFirst);
        }

        return -1;
      })()
    }))
    .sort((left, right) => right.score - left.score)[0];

  if (!bestCandidate || bestCandidate.score < 0) {
    return null;
  }

  return {
    localSlug: bestCandidate.entry.localSlug,
    photoUrl: bestCandidate.entry.photoUrl
  };
}

function getPromotionHeadline(slug: string, locale: "ru" | "en") {
  const map: Record<string, { ru: string; en: string }> = {
    ufc: {
      ru: "Официальные рейтинги UFC по дивизионам",
      en: "Official UFC divisional rankings"
    },
    pfl: {
      ru: "Ростер PFL по весовым категориям",
      en: "PFL roster broken down by divisions"
    },
    one: {
      ru: "Рейтинг бойцов ONE по категориям",
      en: "ONE rankings grouped by divisions"
    }
  };

  return map[slug]?.[locale] ?? (locale === "ru" ? "Рейтинги по дивизионам" : "Divisional rankings");
}

export default async function RankingsPage({ searchParams }: RankingsPageProps) {
  const locale = await getLocale();
  const params = (await searchParams) ?? {};
  const promotion = readParam(params.promotion);
  const { promotions, selectedPromotion, rankingsByWeight } = await getPromotionRankingsPageData({
    promotion
  });

  const isUfc = selectedPromotion === "ufc";
  const isPfl = selectedPromotion === "pfl";
  const ufcGroups = isUfc ? await fetchUfcOfficialRankings() : [];
  const ufcLinks = isUfc ? await getUfcOfficialRankingLinks() : null;
  const pflGroups = isPfl ? await fetchPflOfficialRankings() : [];
  const pflLinks = isPfl ? await getPromotionRankingLinks("pfl") : null;

  return (
    <main className="container">
      <PageHero
        eyebrow="/rankings"
        title={locale === "ru" ? "Рейтинги" : "Rankings"}
        description={
          locale === "ru"
            ? "Выбери лигу и смотри набор отдельных таблиц по каждой весовой категории."
            : "Choose a promotion and view a dedicated table for each weight class."
        }
      />

      <section className="stack">
        <div className="filter-group fighter-filters">
          <div className="filter-head">
            <h3>{locale === "ru" ? "Лига" : "Promotion"}</h3>
          </div>
          <div className="filter-chip-row">
            {promotions.map((promotionItem) => (
              <Link
                key={promotionItem.slug}
                href={buildPromotionHref(promotionItem.slug)}
                className={`filter-chip ${selectedPromotion === promotionItem.slug ? "active" : ""}`}
              >
                {promotionItem.shortName || promotionItem.name}
              </Link>
            ))}
          </div>
        </div>

        {isUfc ? (
          <div className="rankings-stack">
            <section className="ranking-intro-card">
              <p className="eyebrow">{locale === "ru" ? "Выбранная лига" : "Selected promotion"}</p>
              <h2>{getPromotionHeadline(selectedPromotion, locale)}</h2>
              <p className="table-note">
                {locale === "ru" ? "Источник: UFC.com / Rankings" : "Source: UFC.com / Rankings"} ·{" "}
                <a href="https://www.ufc.com/rankings" target="_blank" rel="noreferrer">
                  UFC.com
                </a>
              </p>
            </section>

            {ufcGroups.map((group) => {
              const championLink =
                ufcLinks?.bySlug.get(group.champion.officialSlug.toLowerCase()) ??
                ufcLinks?.byName.get(group.champion.name.toLowerCase()) ??
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
                      <Link
                        href={
                          championLink?.localSlug
                            ? `/fighters/${championLink.localSlug}`
                            : championLink?.officialUrl ?? `https://www.ufc.com/athlete/${group.champion.officialSlug}`
                        }
                      >
                        {locale === "ru" ? "Открыть профиль" : "Open profile"}
                      </Link>
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
                            ufcLinks?.bySlug.get(fighter.officialSlug.toLowerCase()) ??
                            ufcLinks?.byName.get(fighter.name.toLowerCase()) ??
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
                                <Link
                                  href={
                                    link?.localSlug
                                      ? `/fighters/${link.localSlug}`
                                      : link?.officialUrl ?? `https://www.ufc.com/athlete/${fighter.officialSlug}`
                                  }
                                >
                                  {locale === "ru" ? "Открыть" : "Open"}
                                </Link>
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
        ) : isPfl ? (
          <div className="rankings-stack">
            <section className="ranking-intro-card">
              <p className="eyebrow">{locale === "ru" ? "Выбранная лига" : "Selected promotion"}</p>
              <h2>{getPromotionHeadline(selectedPromotion, locale)}</h2>
              <p className="table-note">
                {locale === "ru" ? "Источник: PFLMMA.com / Rankings" : "Source: PFLMMA.com / Rankings"} ·{" "}
                <a href="https://pflmma.com/rankings" target="_blank" rel="noreferrer">
                  PFLMMA.com
                </a>
              </p>
            </section>

            {pflGroups.map((group) => {
              const championLink = findPromotionRankingLink(group.champion.name, pflLinks);
              const visibleRows =
                group.rows[0]?.name.toLowerCase() === group.champion.name.toLowerCase()
                  ? group.rows.slice(1)
                  : group.rows;

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
                      <span>{group.champion.isChampion ? (locale === "ru" ? "Чемпион дивизиона" : "Division champion") : (locale === "ru" ? "Лидер рейтинга" : "Top-ranked fighter")}</span>
                      <strong>{group.champion.name}</strong>
                      {championLink?.localSlug ? (
                        <Link href={`/fighters/${championLink.localSlug}`}>
                          {locale === "ru" ? "Открыть профиль" : "Open profile"}
                        </Link>
                      ) : null}
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
                        {visibleRows.map((fighter, index) => {
                          const link = findPromotionRankingLink(fighter.name, pflLinks);

                          return (
                            <tr key={`${group.title}-${fighter.rank}`} className="ranking-row">
                              <td>{group.champion.isChampion ? index + 2 : index + 1}</td>
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
                                    <span>PFL</span>
                                  </div>
                                </div>
                              </td>
                              <td>
                                {link?.localSlug ? (
                                  <Link href={`/fighters/${link.localSlug}`}>
                                    {locale === "ru" ? "Открыть" : "Open"}
                                  </Link>
                                ) : (
                                  <span>—</span>
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
        ) : rankingsByWeight.length > 0 ? (
          <div className="rankings-stack">
            <section className="ranking-intro-card">
              <p className="eyebrow">{locale === "ru" ? "Выбранная лига" : "Selected promotion"}</p>
              <h2>{getPromotionHeadline(selectedPromotion, locale)}</h2>
              <p className="copy">
                {locale === "ru"
                  ? "Для этой лиги пока используется внутренняя редакционная таблица на основе текущей базы бойцов."
                  : "This promotion currently uses an internal editorial table built from the current roster data."}
              </p>
            </section>

            {rankingsByWeight.map((group) => {
              const champion = group.fighters.find((fighter) => fighter.status === "champion");

              return (
                <section key={group.weightClass} className="table-card ranking-table-card editorial-card">
                  <div className="ranking-table-head">
                    <div className="ranking-head-copy">
                      <h3>{formatWeightClass(group.weightClass, locale)}</h3>
                      <p className="table-note">
                        {locale === "ru"
                          ? `Бойцов в таблице: ${group.fighters.length}`
                          : `Fighters in table: ${group.fighters.length}`}
                      </p>
                    </div>

                    {champion ? (
                      <div className="ranking-champion-badge">
                        <span>{locale === "ru" ? "Чемпион" : "Champion"}</span>
                        <strong>{locale === "ru" ? champion.nameRu ?? champion.name : champion.name}</strong>
                      </div>
                    ) : null}
                  </div>

                  <div className="table-wrap">
                    <table className="ranking-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>{locale === "ru" ? "Боец" : "Fighter"}</th>
                          <th>{locale === "ru" ? "Рекорд" : "Record"}</th>
                          <th>{locale === "ru" ? "Статус" : "Status"}</th>
                          <th>{locale === "ru" ? "Профиль" : "Profile"}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.fighters.map((fighter, index) => {
                          const displayName = locale === "ru" ? fighter.nameRu ?? fighter.name : fighter.name;
                          const displayRecord = fighter.record?.trim() ? fighter.record : "—";
                          const isChampion = fighter.status === "champion";

                          return (
                            <tr key={fighter.id} className={isChampion ? "ranking-row champion-row" : "ranking-row"}>
                              <td>{index + 1}</td>
                              <td>
                                <div className="ranking-fighter-cell">
                                  {fighter.photoUrl ? (
                                    <img
                                      src={fighter.photoUrl}
                                      alt={displayName}
                                      className="ranking-fighter-photo"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <div className="ranking-fighter-photo ranking-fighter-photo--placeholder" aria-hidden="true">
                                      {displayName.charAt(0)}
                                    </div>
                                  )}
                                  <div className="ranking-fighter-copy">
                                    <strong>{displayName}</strong>
                                    {fighter.promotion?.shortName ? <span>{fighter.promotion.shortName}</span> : null}
                                  </div>
                                </div>
                              </td>
                              <td>{displayRecord}</td>
                              <td>
                                <span className={`ranking-status ${isChampion ? "champion" : ""}`}>
                                  {formatFighterStatus(fighter.status, locale)}
                                </span>
                              </td>
                              <td>
                                <Link href={`/fighters/${fighter.slug}`}>{locale === "ru" ? "Открыть" : "Open"}</Link>
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
        ) : (
          <section className="filter-empty-state">
            <h3>{locale === "ru" ? "Для этой лиги пока нет рейтинговых данных" : "No ranking data is available for this promotion yet"}</h3>
            <p className="copy">
              {locale === "ru"
                ? "Когда база бойцов этой организации будет заполнена глубже, здесь появятся полноценные таблицы по весам."
                : "As the roster for this organization becomes more complete, full divisional tables will appear here."}
            </p>
          </section>
        )}
      </section>
    </main>
  );
}
