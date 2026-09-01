import { cache } from "react";

import { prisma } from "@/lib/prisma";
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
