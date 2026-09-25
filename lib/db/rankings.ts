import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { isPlaceholderFightSlug } from "@/lib/sitemap-entries";
import {
  planUfcRankingSnapshotRefresh,
  toUfcRankingSnapshotView,
  UFC_RANKING_SNAPSHOT_KEY
} from "@/lib/ufc-ranking-snapshot";
import { applyAthleteSlugAliases, collectAthleteSlugs } from "@/lib/ufc-athlete-slug";
import { fetchUfcOfficialRankings, type UfcOfficialRankingGroup } from "@/lib/ufc-rankings";

import { resolveEnglishAthleteSlugs } from "./ufc-athlete-slugs";

export const getUfcRankingSnapshot = cache(async function getUfcRankingSnapshot() {
  const record = await prisma.ufcRankingSnapshot.findUnique({
    where: { key: UFC_RANKING_SNAPSHOT_KEY },
    select: {
      payload: true,
      fetchedAt: true
    }
  });

  return toUfcRankingSnapshotView(record);
});

async function resolveRankingSlugs(groups: UfcOfficialRankingGroup[]) {
  if (groups.length === 0) return groups;

  try {
    const resolved = await resolveEnglishAthleteSlugs(collectAthleteSlugs(groups));
    return applyAthleteSlugAliases(groups, resolved);
  } catch (error) {
    console.error("[ufc-rankings] slug resolution failed; keeping upstream slugs", error);
    return groups;
  }
}

export async function refreshUfcRankingSnapshot() {
  const current = await prisma.ufcRankingSnapshot.findUnique({
    where: { key: UFC_RANKING_SNAPSHOT_KEY },
    select: {
      payload: true,
      fetchedAt: true
    }
  });
  const rawGroups = await fetchUfcOfficialRankings();
  // UFC.com редиректит наш IP на ufc.ru, откуда слаги приходят русскими и с
  // локальными Fighter.slug не совпадают. Резолв не имеет права уронить
  // обновление: любая ошибка оставляет русский слаг, и строка ведёт себя как
  // раньше.
  const incomingGroups = await resolveRankingSlugs(rawGroups);
  const fetchedAt = new Date();
  const plan = planUfcRankingSnapshotRefresh(current, incomingGroups, fetchedAt);

  if (!plan.shouldWrite) {
    return {
      updated: false,
      preserved: plan.preserved,
      snapshot: plan.snapshot,
      reason: "empty_or_invalid_upstream" as const
    };
  }

  await prisma.ufcRankingSnapshot.upsert({
    where: { key: UFC_RANKING_SNAPSHOT_KEY },
    create: {
      key: UFC_RANKING_SNAPSHOT_KEY,
      payload: plan.payload,
      fetchedAt
    },
    update: {
      payload: plan.payload,
      fetchedAt
    }
  });

  return {
    updated: true,
    preserved: false,
    snapshot: plan.snapshot,
    reason: null
  };
}

export type RankingFighterDetails = {
  record: string;
  country: string;
  nextFight: {
    opponentName: string;
    opponentNameRu: string | null;
    opponentSlug: string;
    eventName: string;
    eventSlug: string;
    date: Date;
    fightSlug: string | null;
  } | null;
};

// Рекорд, страна и ближайший бой бойцов одного дивизиона — для страницы
// /rankings/<дивизион>. Один запрос на бойцов и один на их запланированные бои.
export async function getRankingFighterDetails(slugs: string[]): Promise<Map<string, RankingFighterDetails>> {
  const unique = [...new Set(slugs.filter(Boolean))];
  if (unique.length === 0) return new Map();

  const fighters = await prisma.fighter.findMany({
    where: { slug: { in: unique } },
    select: { id: true, slug: true, record: true, country: true }
  });
  const ids = fighters.map((fighter) => fighter.id);
  const fights = await prisma.fight.findMany({
    where: {
      status: "scheduled",
      event: { date: { gte: new Date(Date.now() - 86_400_000) } },
      OR: [{ fighterAId: { in: ids } }, { fighterBId: { in: ids } }]
    },
    select: {
      slug: true,
      fighterA: { select: { slug: true, name: true, nameRu: true } },
      fighterB: { select: { slug: true, name: true, nameRu: true } },
      event: { select: { name: true, slug: true, date: true } }
    },
    orderBy: { event: { date: "asc" } }
  });

  const details = new Map<string, RankingFighterDetails>();
  for (const fighter of fighters) {
    // Бой с необъявленным соперником («TBA») ближайшим боем не считаем.
    const fight = fights.find((item) => {
      const other = item.fighterA.slug === fighter.slug ? item.fighterB : item.fighterB.slug === fighter.slug ? item.fighterA : null;
      return other !== null && !isPlaceholderFightSlug(other.slug);
    });
    const opponent = fight ? (fight.fighterA.slug === fighter.slug ? fight.fighterB : fight.fighterA) : null;
    details.set(fighter.slug, {
      record: fighter.record,
      country: fighter.country,
      nextFight:
        fight && opponent
          ? {
              opponentName: opponent.name,
              opponentNameRu: opponent.nameRu,
              opponentSlug: opponent.slug,
              eventName: fight.event.name,
              eventSlug: fight.event.slug,
              date: fight.event.date,
              fightSlug: fight.slug
            }
          : null
    });
  }

  return details;
}
