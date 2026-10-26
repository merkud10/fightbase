// Действующие чемпионы UFC из снимка официального рейтинга — для страницы
// /champions и списка чемпионов на хабе /rankings. Снимок с ufc.ru содержит
// пустые дубли дивизионов (те же заголовки без топ-15) и P4P-списки, где
// «чемпион» — просто первый номер; ни то ни другое в список чемпионов не идёт.

import { findRankingDivision, RANKING_DIVISIONS, type RankingDivision } from "@/lib/ranking-divisions";
import type { UfcOfficialRankingGroup } from "@/lib/ufc-rankings";

export type UfcChampion = {
  division: RankingDivision;
  champion: UfcOfficialRankingGroup["champion"];
  vacant: boolean;
  // Место чемпиона в P4P своего пола; null — не входит в список.
  p4pRank: number | null;
};

function findP4pRank(group: UfcOfficialRankingGroup | undefined, champion: UfcOfficialRankingGroup["champion"]) {
  const row = group?.rows.find(
    (item) => item.officialSlug === champion.officialSlug || item.name.toLowerCase() === champion.name.toLowerCase()
  );
  return row ? row.rank : null;
}

export function buildChampionList(groups: readonly UfcOfficialRankingGroup[]): UfcChampion[] {
  const bySlug = new Map<string, UfcOfficialRankingGroup>();
  for (const group of groups) {
    const division = findRankingDivision(group.title);
    if (division && !bySlug.has(division.slug)) bySlug.set(division.slug, group);
  }

  return RANKING_DIVISIONS.filter((division) => !division.poundForPound && bySlug.has(division.slug)).map((division) => {
    const group = bySlug.get(division.slug)!;
    const vacant = !group.champion.name.trim();
    const p4p = bySlug.get(division.slug.startsWith("womens-") ? "womens-pound-for-pound" : "pound-for-pound");
    return { division, champion: group.champion, vacant, p4pRank: vacant ? null : findP4pRank(p4p, group.champion) };
  });
}
