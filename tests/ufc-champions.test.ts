import test from "node:test";
import assert from "node:assert/strict";

import { buildChampionList } from "../lib/ufc-champions";
import type { UfcOfficialRankingGroup } from "../lib/ufc-rankings";

function group(title: string, champion: string, rows: string[] = []): UfcOfficialRankingGroup {
  return {
    title,
    champion: { name: champion, officialSlug: champion.toLowerCase().replace(/\s+/g, "-"), imageUrl: null },
    rows: rows.map((name, index) => ({ rank: index + 1, name, officialSlug: name.toLowerCase().replace(/\s+/g, "-"), badge: null }))
  };
}

// Форма снимка с ufc.ru: сначала группы с топ-15, потом пустые дубли тех же дивизионов.
const snapshot: UfcOfficialRankingGroup[] = [
  group("Вне зависимости от категорий", "Ислам Махачев", ["Ислам Махачев", "Илия Топурия", "Пётр Ян"]),
  group("Тяжелый вес", "Сирил Ган", ["Том Аспинэлл"]),
  group("Легчайший вес", "Пётр Ян", ["Мераб Двалишвили"]),
  group("Наилегчайший вес", "Джошуа Ван", ["Александр Пантожа"]),
  group("Женский, вне весовых категорий", "Валентина Шевченко", ["Валентина Шевченко", "Кайла Харрисон"]),
  group("Женский легчайший вес", "Кайла Харрисон", ["Джулианна Пенья"]),
  group("Полусредний вес", "", ["Иэн Мачадо Гэрри"]),
  group("Тяжелый вес", "Сирил Ган"),
  group("Легчайший вес", "Пётр Ян")
];

test("buildChampionList orders divisions from flyweight up, men before women, without P4P or duplicate groups", () => {
  const list = buildChampionList(snapshot);
  assert.deepEqual(
    list.map((item) => item.division.slug),
    ["flyweight", "bantamweight", "welterweight", "heavyweight", "womens-bantamweight"]
  );
});

test("buildChampionList marks a division without a champion name as vacant", () => {
  const welterweight = buildChampionList(snapshot).find((item) => item.division.slug === "welterweight");
  assert.equal(welterweight?.vacant, true);
  assert.equal(buildChampionList(snapshot).find((item) => item.division.slug === "heavyweight")?.vacant, false);
});

test("buildChampionList finds the champion's place in the matching pound-for-pound list", () => {
  const list = buildChampionList(snapshot);
  assert.equal(list.find((item) => item.division.slug === "bantamweight")?.p4pRank, 3);
  assert.equal(list.find((item) => item.division.slug === "womens-bantamweight")?.p4pRank, 2);
  assert.equal(list.find((item) => item.division.slug === "heavyweight")?.p4pRank, null);
});

test("buildChampionList returns an empty list for an empty snapshot", () => {
  assert.deepEqual(buildChampionList([]), []);
});
