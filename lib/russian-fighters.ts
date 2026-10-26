// Хаб /russian-fighters: российские бойцы UFC по весовым категориям, чемпионы,
// места в рейтинге и завершившие карьеру. По Вордстату (октябрь 2026) ищут
// «русские бойцы юфс» (~1 тыс. в месяц) и «российские бойцы в ufc» (~350).

import { findRankingDivision, RANKING_DIVISIONS, type RankingDivision } from "@/lib/ranking-divisions";

const RUSSIA = "Россия";

// Страна в базе приходит из ESPN и указывает место рождения или жительства, а не
// то, кого боец представляет в UFC. Здесь — бойцы, которых ESPN записал в Россию,
// но которые выступают за другую страну. Ключ — Fighter.slug.
const NOT_RUSSIAN_IN_UFC = new Set<string>([
  // Родился в Дагестане, выступает за Францию.
  "nassourdine-imavov",
  // Родилась в России, выросла в США и выступала в UFC как американка.
  "justine-kish",
  // Родом из Беларуси, в UFC выступал из США.
  "vladimir-matyushenko"
]);

export function isRussianFighter(fighter: { slug: string; country: string }) {
  return fighter.country === RUSSIA && !NOT_RUSSIAN_IN_UFC.has(fighter.slug);
}

type HubFighter = { slug: string; weightClass: string; status: string; country: string };

// Место в официальном рейтинге: rank null — чемпион дивизиона.
export type FighterRanking = { division: RankingDivision; rank: number | null };

function rankOrder(ranking: FighterRanking | undefined) {
  if (!ranking) return Number.POSITIVE_INFINITY;
  return ranking.rank ?? 0;
}

export function buildRussianFightersHub<T extends HubFighter>(fighters: readonly T[], rankings: ReadonlyMap<string, FighterRanking>) {
  const russians = fighters.filter(isRussianFighter);
  const active = russians.filter((fighter) => fighter.status !== "retired");
  const retired = russians.filter((fighter) => fighter.status === "retired").sort((left, right) => left.slug.localeCompare(right.slug));

  const withRanking = active.map((fighter) => ({
    fighter,
    division: findRankingDivision(fighter.weightClass),
    ranking: rankings.get(fighter.slug)
  }));
  const byRank = (left: (typeof withRanking)[number], right: (typeof withRanking)[number]) =>
    rankOrder(left.ranking) - rankOrder(right.ranking) || left.fighter.slug.localeCompare(right.fighter.slug);

  const divisions = RANKING_DIVISIONS.filter((division) => !division.poundForPound)
    .map((division) => ({
      division: division as RankingDivision | null,
      fighters: withRanking.filter((item) => item.division?.slug === division.slug).sort(byRank)
    }))
    .filter((group) => group.fighters.length > 0);
  const unplaced = withRanking.filter((item) => !item.division || item.division.poundForPound).sort(byRank);
  if (unplaced.length > 0) divisions.push({ division: null, fighters: unplaced });

  return {
    activeCount: active.length,
    divisions,
    champions: withRanking.filter((item) => item.ranking && item.ranking.rank === null),
    retired
  };
}
