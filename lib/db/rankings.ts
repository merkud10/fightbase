import { cache } from "react";

import { prisma } from "@/lib/prisma";
import {
  planUfcRankingSnapshotRefresh,
  toUfcRankingSnapshotView,
  UFC_RANKING_SNAPSHOT_KEY
} from "@/lib/ufc-ranking-snapshot";
import { fetchUfcOfficialRankings } from "@/lib/ufc-rankings";

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

export async function refreshUfcRankingSnapshot() {
  const current = await prisma.ufcRankingSnapshot.findUnique({
    where: { key: UFC_RANKING_SNAPSHOT_KEY },
    select: {
      payload: true,
      fetchedAt: true
    }
  });
  const incomingGroups = await fetchUfcOfficialRankings();
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
