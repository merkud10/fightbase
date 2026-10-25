import assert from "node:assert/strict";
import test from "node:test";

import {
  deserializeUfcRankingGroups,
  isUfcRankingSnapshotStale,
  normalizeUfcRankingGroups,
  planUfcRankingSnapshotRefresh,
  serializeUfcRankingGroups,
  toUfcRankingSnapshotView
} from "../lib/ufc-ranking-snapshot";
import type { UfcOfficialRankingGroup } from "../lib/ufc-rankings";

const rankingGroups: UfcOfficialRankingGroup[] = [
  {
    title: "Lightweight",
    champion: {
      name: "Champion One",
      officialSlug: "champion-one",
      imageUrl: "https://example.com/champion.jpg"
    },
    rows: [
      {
        rank: 1,
        name: "Contender One",
        officialSlug: "contender-one",
        badge: null
      }
    ]
  }
];

function makeGroup(title: string, ranks: number[]): UfcOfficialRankingGroup {
  return {
    title,
    champion: {
      name: "Champ Person",
      officialSlug: "champ-person",
      imageUrl: null
    },
    rows: ranks.map((rank, index) => ({
      rank,
      name: `Fighter ${index}`,
      officialSlug: `fighter-${index}`,
      badge: null
    }))
  };
}

test("normalizeUfcRankingGroups renumbers legacy 2-based contiguous ranks back to 1-based", () => {
  const [group] = normalizeUfcRankingGroups([makeGroup("Наилегчайший вес", [2, 3, 4])]);
  assert.deepEqual(
    group?.rows.map((row) => row.rank),
    [1, 2, 3]
  );
  assert.deepEqual(
    group?.rows.map((row) => row.name),
    ["Fighter 0", "Fighter 1", "Fighter 2"]
  );
});

test("normalizeUfcRankingGroups leaves 1-based and non-contiguous ranks untouched", () => {
  const groups = normalizeUfcRankingGroups([
    makeGroup("Flyweight", [1, 2, 3]),
    makeGroup("Bantamweight", [2, 4, 5]),
    makeGroup("Featherweight", [])
  ]);
  assert.deepEqual(groups[0]?.rows.map((row) => row.rank), [1, 2, 3]);
  assert.deepEqual(groups[1]?.rows.map((row) => row.rank), [2, 4, 5]);
  assert.deepEqual(groups[2]?.rows, []);
});

test("normalizeUfcRankingGroups strips a trailing Top Rank suffix from titles", () => {
  const groups = normalizeUfcRankingGroups([
    makeGroup("Вне зависимости от категорий Top Rank", [1]),
    makeGroup("Men's Pound-for-Pound Top Rank", [1]),
    makeGroup("Flyweight", [1])
  ]);
  assert.deepEqual(
    groups.map((group) => group.title),
    ["Вне зависимости от категорий", "Men's Pound-for-Pound", "Flyweight"]
  );
});

test("normalizeUfcRankingGroups does not mutate its input", () => {
  const input = [makeGroup("Вне зависимости от категорий Top Rank", [2, 3])];
  normalizeUfcRankingGroups(input);
  assert.equal(input[0]?.title, "Вне зависимости от категорий Top Rank");
  assert.deepEqual(input[0]?.rows.map((row) => row.rank), [2, 3]);
});

test("toUfcRankingSnapshotView serves legacy payloads normalized", () => {
  const legacyPayload = JSON.stringify([makeGroup("Женский, вне весовых категорий Top Rank", [2, 3, 4])]);
  const view = toUfcRankingSnapshotView({ payload: legacyPayload, fetchedAt: new Date("2026-08-01T00:00:00.000Z") });
  assert.equal(view?.groups[0]?.title, "Женский, вне весовых категорий");
  assert.deepEqual(
    view?.groups[0]?.rows.map((row) => row.rank),
    [1, 2, 3]
  );
});

test("UFC ranking snapshots serialize and deserialize validated groups", () => {
  const payload = serializeUfcRankingGroups(rankingGroups);
  assert.deepEqual(deserializeUfcRankingGroups(payload), rankingGroups);
  assert.equal(deserializeUfcRankingGroups("not-json"), null);
  assert.equal(deserializeUfcRankingGroups("[]"), null);
  assert.equal(deserializeUfcRankingGroups('[{"title":"Lightweight"}]'), null);
});

test("snapshot staleness uses the configured age boundary", () => {
  const now = new Date("2026-07-10T12:00:00.000Z");
  assert.equal(isUfcRankingSnapshotStale("2026-07-09T12:00:00.000Z", now), false);
  assert.equal(isUfcRankingSnapshotStale("2026-07-08T12:00:00.000Z", now), true);
  assert.equal(isUfcRankingSnapshotStale("invalid", now), true);
});

test("an empty upstream response preserves the last good snapshot", () => {
  const previousFetchedAt = new Date("2026-07-08T12:00:00.000Z");
  const refreshTime = new Date("2026-07-10T12:00:00.000Z");
  const plan = planUfcRankingSnapshotRefresh(
    {
      payload: serializeUfcRankingGroups(rankingGroups),
      fetchedAt: previousFetchedAt
    },
    [],
    refreshTime
  );

  assert.equal(plan.shouldWrite, false);
  assert.equal(plan.preserved, true);
  assert.deepEqual(plan.snapshot?.groups, rankingGroups);
  assert.equal(plan.snapshot?.fetchedAt.toISOString(), previousFetchedAt.toISOString());
  assert.equal(plan.snapshot?.isStale, true);
});

test("an empty response without a good snapshot does not create one", () => {
  const plan = planUfcRankingSnapshotRefresh(null, [], new Date("2026-07-10T12:00:00.000Z"));
  assert.equal(plan.shouldWrite, false);
  assert.equal(plan.preserved, false);
  assert.equal(plan.snapshot, null);
});

test("usable upstream data produces a fresh write plan", () => {
  const fetchedAt = new Date("2026-07-10T12:00:00.000Z");
  const plan = planUfcRankingSnapshotRefresh(null, rankingGroups, fetchedAt);

  assert.equal(plan.shouldWrite, true);
  if (!plan.shouldWrite) return;
  assert.deepEqual(deserializeUfcRankingGroups(plan.payload), rankingGroups);
  assert.equal(plan.snapshot.fetchedAt.toISOString(), fetchedAt.toISOString());
  assert.equal(plan.snapshot.isStale, false);
});

function fullGroups(count: number, rowsPerGroup: number): UfcOfficialRankingGroup[] {
  return Array.from({ length: count }, (_, index) =>
    makeGroup(`Division ${index + 1}`, Array.from({ length: rowsPerGroup }, (_, rank) => rank + 1))
  );
}

test("a much smaller upstream snapshot does not overwrite a full one", () => {
  const current = { payload: serializeUfcRankingGroups(fullGroups(24, 15)), fetchedAt: new Date("2026-10-25T06:00:00.000Z") };
  // 25.10.2026: ufc.ru сменил ссылки, парсер потерял 15 дивизионов из 24 и почти все строки.
  const fewerGroups = planUfcRankingSnapshotRefresh(current, fullGroups(9, 15), new Date("2026-10-25T23:02:00.000Z"));
  assert.equal(fewerGroups.shouldWrite, false);
  assert.equal(fewerGroups.preserved, true);
  assert.equal(fewerGroups.snapshot?.groups.length, 24);

  const fewerRows = planUfcRankingSnapshotRefresh(current, fullGroups(24, 3), new Date("2026-10-25T23:02:00.000Z"));
  assert.equal(fewerRows.shouldWrite, false);
});

test("a full upstream snapshot replaces a degraded one and small changes still write", () => {
  const degraded = { payload: serializeUfcRankingGroups(fullGroups(9, 2)), fetchedAt: new Date("2026-10-25T23:02:00.000Z") };
  assert.equal(planUfcRankingSnapshotRefresh(degraded, fullGroups(24, 15)).shouldWrite, true);

  const current = { payload: serializeUfcRankingGroups(fullGroups(24, 15)), fetchedAt: new Date("2026-10-25T06:00:00.000Z") };
  assert.equal(planUfcRankingSnapshotRefresh(current, fullGroups(23, 15)).shouldWrite, true);
});
