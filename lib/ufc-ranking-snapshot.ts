import type { UfcOfficialRankingGroup } from "@/lib/ufc-rankings";

export const UFC_RANKING_SNAPSHOT_KEY = "ufc-official-rankings";
export const UFC_RANKING_SNAPSHOT_MAX_AGE_MS = 36 * 60 * 60 * 1000;

type SnapshotRecord = {
  payload: string;
  fetchedAt: Date | string;
};

export type UfcRankingSnapshotView = {
  groups: UfcOfficialRankingGroup[];
  // Когда мы в последний раз успешно опросили UFC.com.
  fetchedAt: Date;
  // Когда UFC сам обновил рейтинг («Last updated» на странице); null — неизвестно.
  sourceUpdatedAt: Date | null;
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

// Снимок с датой обновления UFC хранится в том же текстовом поле конвертом
// { sourceUpdatedAt, groups }: отдельная колонка потребовала бы миграции, а
// старые снимки-массивы читаются как раньше.
export function serializeUfcRankingSnapshot(groups: UfcOfficialRankingGroup[], sourceUpdatedAt: Date | null) {
  if (!isUsableUfcRankingGroups(groups)) {
    throw new Error("Cannot serialize an empty or malformed UFC ranking snapshot.");
  }

  return JSON.stringify({ sourceUpdatedAt: sourceUpdatedAt ? sourceUpdatedAt.toISOString() : null, groups });
}

function parseSnapshotPayload(payload: string): { groups: unknown; sourceUpdatedAt: unknown } | null {
  try {
    const parsed: unknown = JSON.parse(payload);
    if (Array.isArray(parsed)) return { groups: parsed, sourceUpdatedAt: null };
    return isRecord(parsed) ? { groups: parsed.groups, sourceUpdatedAt: parsed.sourceUpdatedAt } : null;
  } catch {
    return null;
  }
}

export function readUfcRankingSourceUpdatedAt(payload: string): Date | null {
  const value = parseSnapshotPayload(payload)?.sourceUpdatedAt;
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

// Production still serves snapshots written by an older ingester that numbered ranked rows
// from 2 (the champion implicitly occupied slot 1) and kept the raw "… Top Rank" division
// titles. UFC.com numbers contenders from 1 and lists the champion separately, so renumber
// that legacy shape on read instead of waiting for a successful upstream refresh.
//
// Ниже официального рейтинга на странице UFC стоит вторая таблица (алгоритмический
// Meta UFC Rankings) с теми же заголовками дивизионов и другой разметкой строк:
// парсер берёт из неё заголовок и чемпиона, но ни одной строки. Такой пустой дубль
// выбрасываем, если у того же дивизиона есть группа со строками.
export function normalizeUfcRankingGroups(groups: UfcOfficialRankingGroup[]): UfcOfficialRankingGroup[] {
  const titleKey = (title: string) => title.replace(/\s+Top Rank$/i, "").trim().toLowerCase();
  const titlesWithRows = new Set(groups.filter((group) => group.rows.length > 0).map((group) => titleKey(group.title)));
  const kept = groups.filter((group) => group.rows.length > 0 || !titlesWithRows.has(titleKey(group.title)));

  return kept.map((group) => {
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
  const groups = parseSnapshotPayload(payload)?.groups;
  return isUsableUfcRankingGroups(groups) ? groups : null;
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
    sourceUpdatedAt: readUfcRankingSourceUpdatedAt(record.payload),
    isStale: isUfcRankingSnapshotStale(fetchedAt, now)
  };
}

// Доля дивизионов и строк, ниже которой новый снимок считаем поломкой разбора,
// а не настоящим изменением рейтинга. 25.10.2026 ufc.ru сменил разметку ссылок,
// и вместо 24 групп пришло 9 с 21 строкой — снимок перезаписался, страницы
// дивизионов опустели. Дивизионы UFC так резко не меняются.
const DEGRADED_REFRESH_RATIO = 0.75;

function countRows(groups: UfcOfficialRankingGroup[]) {
  return groups.reduce((total, group) => total + group.rows.length, 0);
}

function isDegradedRefresh(current: SnapshotRecord | null, incomingGroups: UfcOfficialRankingGroup[]) {
  const currentGroups = current ? deserializeUfcRankingGroups(current.payload) : null;
  if (!currentGroups) return false;
  return (
    incomingGroups.length < currentGroups.length * DEGRADED_REFRESH_RATIO ||
    countRows(incomingGroups) < countRows(currentGroups) * DEGRADED_REFRESH_RATIO
  );
}

export function planUfcRankingSnapshotRefresh(
  current: SnapshotRecord | null,
  incomingGroups: UfcOfficialRankingGroup[],
  fetchedAt = new Date(),
  sourceUpdatedAt: Date | null = null
): RankingRefreshPlan {
  if (!isUsableUfcRankingGroups(incomingGroups) || isDegradedRefresh(current, incomingGroups)) {
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
    payload: serializeUfcRankingSnapshot(normalizedGroups, sourceUpdatedAt),
    snapshot: {
      groups: normalizedGroups,
      fetchedAt,
      sourceUpdatedAt,
      isStale: false
    },
    preserved: false
  };
}
