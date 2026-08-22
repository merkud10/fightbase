import type { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { cache } from "react";

import { buildCuratedPairs, type CuratedPair } from "@/lib/compare-curation";
import { splitPairSlugCandidates } from "@/lib/compare-pairs";
import { getBaseWeightClass } from "@/lib/display";
import { prisma } from "@/lib/prisma";
import { getUfcOfficialRankingLinks } from "./fighters";
import { getUfcRankingSnapshot } from "./rankings";

const comparisonFighterSelect = {
  id: true,
  slug: true,
  name: true,
  nameRu: true,
  nickname: true,
  photoUrl: true,
  record: true,
  weightClass: true,
  status: true,
  country: true,
  team: true,
  style: true,
  age: true,
  heightCm: true,
  reachCm: true,
  winsByKnockout: true,
  winsBySubmission: true,
  winsByDecision: true,
  sigStrikesLandedPerMin: true,
  strikeAccuracy: true,
  sigStrikesAbsorbedPerMin: true,
  strikeDefense: true,
  takedownAveragePer15: true,
  takedownAccuracy: true,
  takedownDefense: true,
  submissionAveragePer15: true,
  averageFightTime: true,
  promotionId: true,
  promotion: {
    select: {
      slug: true,
      shortName: true
    }
  }
} satisfies Prisma.FighterSelect;

export type ComparisonFighter = Prisma.FighterGetPayload<{
  select: typeof comparisonFighterSelect;
}>;

export type ComparisonHeadToHeadFight = {
  id: string;
  slug: string | null;
  status: string;
  method: string | null;
  resultRound: number | null;
  resultTime: string | null;
  winnerFighterId: string | null;
  event: {
    slug: string;
    name: string;
    date: Date;
    status: string;
  };
};

export type ComparisonPageData = {
  fighterA: ComparisonFighter;
  fighterB: ComparisonFighter;
  headToHead: ComparisonHeadToHeadFight[];
};

// Каждый кандидат разреза стоит отдельного запроса к базе, а сегмент пути приходит
// извне: `a-vs-a-vs-…` из сотни повторений дал бы сотню запросов на один HTTP-вызов.
// Реальный слаг бойца с "-vs-" внутри — экзотика, больше пары разрезов не бывает.
const MAX_PAIR_SLUG_CANDIDATES = 8;

export const getComparisonPageData = cache(async function getComparisonPageData(
  pairSlug: string
): Promise<ComparisonPageData | null> {
  for (const candidate of splitPairSlugCandidates(pairSlug).slice(0, MAX_PAIR_SLUG_CANDIDATES)) {
    if (candidate.a === candidate.b) {
      continue;
    }

    const fighters = await prisma.fighter.findMany({
      where: { slug: { in: [candidate.a, candidate.b] } },
      select: comparisonFighterSelect
    });

    const fighterA = fighters.find((fighter) => fighter.slug === candidate.a);
    const fighterB = fighters.find((fighter) => fighter.slug === candidate.b);

    // Найдены оба — значит разрез верный; остальные кандидаты уже не проверяем.
    if (!fighterA || !fighterB) {
      continue;
    }

    const fights = await prisma.fight.findMany({
      where: {
        OR: [
          { fighterAId: fighterA.id, fighterBId: fighterB.id },
          { fighterAId: fighterB.id, fighterBId: fighterA.id }
        ]
      },
      select: {
        id: true,
        slug: true,
        status: true,
        method: true,
        resultRound: true,
        resultTime: true,
        winnerFighterId: true,
        event: {
          select: {
            slug: true,
            name: true,
            date: true,
            status: true
          }
        }
      },
      orderBy: {
        event: {
          date: "desc"
        }
      }
    });

    return {
      fighterA,
      fighterB,
      headToHead: fights
    };
  }

  return null;
});

// Набор пар считается двумя полными сканами (все бойцы + все бои), а нужен он на
// каждой странице бойца, на каждой странице пары, на хабе и в sitemap — при обходе
// краулером это тысячи повторов. Меняется набор не чаще снимка рейтинга, поэтому
// час кеша достаточно; cache() сверху дедуплицирует вызовы внутри одного запроса.
const loadCuratedComparisonPairs = unstable_cache(
  async function loadCuratedComparisonPairs(): Promise<CuratedPair[]> {
    const [snapshot, links, fights] = await Promise.all([
      getUfcRankingSnapshot(),
      getUfcOfficialRankingLinks(),
      prisma.fight.findMany({
        select: {
          status: true,
          weightClass: true,
          fighterA: { select: { slug: true } },
          fighterB: { select: { slug: true } }
        }
      })
    ]);

    return buildCuratedPairs({
      groups: snapshot?.groups ?? [],
      fightPairs: fights.map((fight) => ({
        slugA: fight.fighterA.slug,
        slugB: fight.fighterB.slug,
        isScheduled: fight.status === "scheduled",
        weightClass: getBaseWeightClass(fight.weightClass) || null
      })),
      resolveSlug: (name) => links.byName.get(name.toLowerCase())?.localSlug ?? null
    });
  },
  ["compare:curated-pairs:v1"],
  { revalidate: 3600, tags: ["compare-curated-pairs"] }
);

export const getCuratedComparisonPairs = cache(async function getCuratedComparisonPairs(): Promise<CuratedPair[]> {
  return loadCuratedComparisonPairs();
});

export type CuratedPairFighter = {
  slug: string;
  name: string;
  nameRu: string | null;
};

export type NamedCuratedPair = CuratedPair & {
  fighterA: CuratedPairFighter;
  fighterB: CuratedPairFighter;
};

export const getNamedCuratedComparisonPairs = cache(async function getNamedCuratedComparisonPairs(): Promise<
  NamedCuratedPair[]
> {
  const pairs = await getCuratedComparisonPairs();
  const slugs = [...new Set(pairs.flatMap((pair) => [pair.slugA, pair.slugB]))];

  if (slugs.length === 0) {
    return [];
  }

  // Имена догружаем одним запросом по уникальным слагам: пар кратно больше,
  // чем участвующих в них бойцов, и запрос на пару дал бы сотни обращений.
  const fighters = await prisma.fighter.findMany({
    where: { slug: { in: slugs } },
    select: { slug: true, name: true, nameRu: true }
  });
  const bySlug = new Map(fighters.map((fighter) => [fighter.slug, fighter]));

  return pairs.flatMap((pair) => {
    const fighterA = bySlug.get(pair.slugA);
    const fighterB = bySlug.get(pair.slugB);

    // Набор пар и имена бойцов — два независимых запроса с разным временем жизни,
    // и между ними бойца могут удалить. flatMap здесь бесплатно превращает
    // потенциально битую ссылку в её отсутствие.
    if (!fighterA || !fighterB) {
      return [];
    }

    return [{ ...pair, fighterA, fighterB }];
  });
});
