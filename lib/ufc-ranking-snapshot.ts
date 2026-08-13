import type { UfcOfficialRankingGroup } from "@/lib/ufc-rankings";

export const UFC_RANKING_SNAPSHOT_KEY = "ufc-official-rankings";
export const UFC_RANKING_SNAPSHOT_MAX_AGE_MS = 36 * 60 * 60 * 1000;

type SnapshotRecord = {
  payload: string;
  fetchedAt: Date | string;
};

export type UfcRankingSnapshotView = {
  groups: UfcOfficialRankingGroup[];
  fetchedAt: Date;
  isStale: boolean;
};

type RankingRefreshPlan =
  | {
      shouldWrite: true;
      payload: string;
      snapshot: UfcRankingSnapshotView;
      preserved: false;
    }
  | {
      shouldWrite: false;
      snapshot: UfcRankingSnapshotView | null;
      preserved: boolean;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isRankingGroup(value: unknown): value is UfcOfficialRankingGroup {
  if (!isRecord(value) || typeof value.title !== "string" || !isRecord(value.champion) || !Array.isArray(value.rows)) {
    return false;
  }

  const champion = value.champion;
  if (
    typeof champion.name !== "string" ||
    typeof champion.officialSlug !== "string" ||
    !isNullableString(champion.imageUrl)
  ) {
    return false;
  }

  return value.rows.every(
    (row) =>
      isRecord(row) &&
      typeof row.rank === "number" &&
      Number.isFinite(row.rank) &&
      row.rank > 0 &&
      typeof row.name === "string" &&
      typeof row.officialSlug === "string" &&
      isNullableString(row.badge)
  );
}

export function isUsableUfcRankingGroups(value: unknown): value is UfcOfficialRankingGroup[] {
  return Array.isArray(value) && value.length > 0 && value.every(isRankingGroup) && value.some((group) => group.rows.length > 0);
}

export function serializeUfcRankingGroups(groups: UfcOfficialRankingGroup[]) {
  if (!isUsableUfcRankingGroups(groups)) {
    throw new Error("Cannot serialize an empty or malformed UFC ranking snapshot.");
  }

  return JSON.stringify(groups);
}

// Production still serves snapshots written by an older ingester that numbered ranked rows
// from 2 (the champion implicitly occupied slot 1) and kept the raw "… Top Rank" division
// titles. UFC.com numbers contenders from 1 and lists the champion separately, so renumber
// that legacy shape on read instead of waiting for a successful upstream refresh.
export function normalizeUfcRankingGroups(groups: UfcOfficialRankingGroup[]): UfcOfficialRankingGroup[] {
  return groups.map((group) => {
    const sortedRanks = group.rows.map((row) => row.rank).sort((a, b) => a - b);
    const isLegacyShifted =
      sortedRanks.length > 0 && sortedRanks.every((rank, index) => rank === index + 2);

    return {
      ...group,
      title: group.title.replace(/\s+Top Rank$/i, "").trim(),
      rows: isLegacyShifted ? group.rows.map((row) => ({ ...row, rank: row.rank - 1 })) : group.rows
    };
  });
}

export function deserializeUfcRankingGroups(payload: string): UfcOfficialRankingGroup[] | null {
  try {
    const parsed: unknown = JSON.parse(payload);
    return isUsableUfcRankingGroups(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function isUfcRankingSnapshotStale(
  fetchedAt: Date | string,
  now = new Date(),
  maxAgeMs = UFC_RANKING_SNAPSHOT_MAX_AGE_MS
) {
  const fetchedAtMs = new Date(fetchedAt).getTime();
  if (!Number.isFinite(fetchedAtMs)) return true;
  return now.getTime() - fetchedAtMs > maxAgeMs;
}

export function toUfcRankingSnapshotView(record: SnapshotRecord | null, now = new Date()): UfcRankingSnapshotView | null {
  if (!record) return null;

  const groups = deserializeUfcRankingGroups(record.payload);
  const fetchedAt = new Date(record.fetchedAt);
  if (!groups || !Number.isFinite(fetchedAt.getTime())) return null;

  return {
    groups: normalizeUfcRankingGroups(groups),
    fetchedAt,
    isStale: isUfcRankingSnapshotStale(fetchedAt, now)
  };
}

export function planUfcRankingSnapshotRefresh(
  current: SnapshotRecord | null,
  incomingGroups: UfcOfficialRankingGroup[],
  fetchedAt = new Date()
): RankingRefreshPlan {
  if (!isUsableUfcRankingGroups(incomingGroups)) {
    const snapshot = toUfcRankingSnapshotView(current, fetchedAt);
    return {
      shouldWrite: false,
      snapshot,
      preserved: snapshot !== null
    };
  }

  const normalizedGroups = normalizeUfcRankingGroups(incomingGroups);

  return {
    shouldWrite: true,
    payload: serializeUfcRankingGroups(normalizedGroups),
    snapshot: {
      groups: normalizedGroups,
      fetchedAt,
      isStale: false
    },
    preserved: false
  };
}
