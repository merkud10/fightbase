import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCuratedPairs,
  COMPARE_INDEX_RANK_DEPTH,
  isIndexableComparisonPair,
  normalizeCuratedWeightClass
} from "../lib/compare-curation";
import { formatWeightClass } from "../lib/display";

const GROUPS = [
  {
    title: "Легкий вес",
    champion: { name: "Islam Makhachev", officialSlug: "islam-makhachev", imageUrl: null },
    rows: [
      { rank: 1, name: "Arman Tsarukyan", officialSlug: "arman-tsarukyan", badge: null },
      { rank: 2, name: "Charles Oliveira", officialSlug: "charles-oliveira", badge: null }
    ]
  }
];

const RESOLVE = (name: string) => {
  const map: Record<string, string> = {
    "islam makhachev": "islam-makhachev",
    "arman tsarukyan": "arman-tsarukyan",
    "charles oliveira": "charles-oliveira"
  };

  return map[name.toLowerCase()] ?? null;
};

test("ранкед-бойцы дивизиона дают все попарные комбинации", () => {
  const pairs = buildCuratedPairs({ groups: GROUPS, fightPairs: [], resolveSlug: RESOLVE });

  assert.deepEqual(pairs.map((pair) => pair.pairSlug).sort(), [
    "arman-tsarukyan-vs-charles-oliveira",
    "arman-tsarukyan-vs-islam-makhachev",
    "charles-oliveira-vs-islam-makhachev"
  ]);
});

test("боец без локального профиля выпадает из набора", () => {
  const resolve = (name: string) => (name === "Charles Oliveira" ? null : RESOLVE(name));
  const pairs = buildCuratedPairs({ groups: GROUPS, fightPairs: [], resolveSlug: resolve });

  assert.deepEqual(pairs.map((pair) => pair.pairSlug), ["arman-tsarukyan-vs-islam-makhachev"]);
});

test("дубли со слагом вида -N на конце отсеиваются", () => {
  const resolve = (name: string) => (name === "Charles Oliveira" ? "charles-oliveira-2" : RESOLVE(name));
  const pairs = buildCuratedPairs({ groups: GROUPS, fightPairs: [], resolveSlug: resolve });

  assert.deepEqual(pairs.map((pair) => pair.pairSlug), ["arman-tsarukyan-vs-islam-makhachev"]);
});

test("пары из боёв попадают в набор и помечаются hasFight", () => {
  const pairs = buildCuratedPairs({
    groups: [],
    fightPairs: [{ slugA: "sean-omalley", slugB: "aljamain-sterling", isScheduled: true, weightClass: null }],
    resolveSlug: RESOLVE
  });

  assert.equal(pairs.length, 1);
  const first = pairs[0];
  assert.ok(first);
  assert.equal(first.pairSlug, "aljamain-sterling-vs-sean-omalley");
  assert.equal(first.hasFight, true);
  assert.equal(first.isScheduled, true);
});

test("пара из боя и из рейтинга не дублируется, флаги боя сохраняются", () => {
  const pairs = buildCuratedPairs({
    groups: GROUPS,
    fightPairs: [{ slugA: "islam-makhachev", slugB: "arman-tsarukyan", isScheduled: true, weightClass: null }],
    resolveSlug: RESOLVE
  });

  const target = pairs.filter((pair) => pair.pairSlug === "arman-tsarukyan-vs-islam-makhachev");
  assert.equal(target.length, 1);
  const found = target[0];
  assert.ok(found);
  assert.equal(found.hasFight, true);
  assert.equal(found.isScheduled, true);
});

test("при пустом снимке рейтинга набор сводится к парам из боёв", () => {
  const pairs = buildCuratedPairs({
    groups: [],
    fightPairs: [{ slugA: "sean-omalley", slugB: "aljamain-sterling", isScheduled: false, weightClass: null }],
    resolveSlug: RESOLVE
  });

  assert.deepEqual(pairs.map((pair) => pair.pairSlug), ["aljamain-sterling-vs-sean-omalley"]);
});

test("боец сам с собой в набор не попадает", () => {
  const pairs = buildCuratedPairs({
    groups: [],
    fightPairs: [{ slugA: "sean-omalley", slugB: "sean-omalley", isScheduled: false, weightClass: null }],
    resolveSlug: RESOLVE
  });

  assert.deepEqual(pairs, []);
});

// Без этого пары из боёв приходили бы без веса и сваливались на хабе в одну кучу,
// хотя у модели Fight своя весовая категория есть.
test("пара из боя берёт весовую категорию из самого боя", () => {
  const pairs = buildCuratedPairs({
    groups: [],
    fightPairs: [
      { slugA: "sean-omalley", slugB: "aljamain-sterling", isScheduled: true, weightClass: "Bantamweight" }
    ],
    resolveSlug: RESOLVE
  });

  const pair = pairs[0];
  assert.ok(pair);
  assert.equal(pair.weightClass, "Bantamweight");
});

test("вес из рейтинга не затирается парой из боя", () => {
  const pairs = buildCuratedPairs({
    groups: GROUPS,
    fightPairs: [
      { slugA: "islam-makhachev", slugB: "arman-tsarukyan", isScheduled: true, weightClass: "Catchweight" }
    ],
    resolveSlug: RESOLVE
  });

  const pair = pairs.find((item) => item.pairSlug === "arman-tsarukyan-vs-islam-makhachev");
  assert.ok(pair);
  assert.equal(pair.weightClass, "Lightweight");
});

// Пары из P4P междивизионные, а раздел строится по дивизионам.
test("группа pound-for-pound не даёт ни одной пары", () => {
  const base = GROUPS[0];
  assert.ok(base);

  for (const title of ["Men's Pound-for-Pound", "Women's Pound-for-Pound Top Rank", "Вне зависимости от категорий"]) {
    const pairs = buildCuratedPairs({ groups: [{ ...base, title }], fightPairs: [], resolveSlug: RESOLVE });

    assert.deepEqual(pairs, [], title);
  }
});

// Заголовок группы и вес боя попадают в одно поле, поэтому должны быть в одном словаре.
test("заголовок группы нормализуется к тому же весу, что и вес боя", () => {
  const fromGroup = buildCuratedPairs({ groups: GROUPS, fightPairs: [], resolveSlug: RESOLVE });
  const fromFight = buildCuratedPairs({
    groups: [],
    fightPairs: [
      { slugA: "sean-omalley", slugB: "aljamain-sterling", isScheduled: false, weightClass: "Lightweight" }
    ],
    resolveSlug: RESOLVE
  });

  assert.equal(fromGroup[0]?.weightClass, "Lightweight");
  assert.equal(fromFight[0]?.weightClass, fromGroup[0]?.weightClass);
});

// Оба случая всплыли только на проде: в локальной базе таких значений нет.
test("заглушки веса не становятся заголовком секции", () => {
  for (const value of ["Unknown", "TBD", "TBA", "N/A", "-", "", null, undefined]) {
    assert.equal(normalizeCuratedWeightClass(value), null, `ожидался null для ${JSON.stringify(value)}`);
  }
});

test("договорной вес через пробел переводится, а не остаётся английским", () => {
  const normalized = normalizeCuratedWeightClass("Catch Weight");
  assert.equal(normalized, "Catchweight");
  assert.equal(formatWeightClass(normalized as string, "ru"), "Договорной вес");
});

test("слаги в паре хранятся в каноническом порядке", () => {
  const pairs = buildCuratedPairs({
    groups: [],
    fightPairs: [{ slugA: "sean-omalley", slugB: "aljamain-sterling", isScheduled: false, weightClass: null }],
    resolveSlug: RESOLVE
  });

  const canonical = pairs[0];
  assert.ok(canonical);
  assert.equal(canonical.slugA, "aljamain-sterling");
  assert.equal(canonical.slugB, "sean-omalley");
});

test("боец в группе одновременно как чемпион и в rows — пара не дублируется", () => {
  const groups = [
    {
      title: "Легкий вес",
      champion: { name: "Islam Makhachev", officialSlug: "islam-makhachev", imageUrl: null },
      rows: [
        { rank: 1, name: "Arman Tsarukyan", officialSlug: "arman-tsarukyan", badge: null },
        // тот же боец, что и чемпион — должен дать уникальный набор слагов
        { rank: 2, name: "Islam Makhachev", officialSlug: "islam-makhachev", badge: null }
      ]
    }
  ];
  const pairs = buildCuratedPairs({ groups, fightPairs: [], resolveSlug: RESOLVE });

  assert.deepEqual(pairs.map((pair) => pair.pairSlug), ["arman-tsarukyan-vs-islam-makhachev"]);
});

test("weightClass берётся из рейтинга, если пара сначала пришла из боя", () => {
  const pairs = buildCuratedPairs({
    groups: GROUPS,
    fightPairs: [{ slugA: "arman-tsarukyan", slugB: "islam-makhachev", isScheduled: false, weightClass: null }],
    resolveSlug: RESOLVE
  });

  const target = pairs.find((pair) => pair.pairSlug === "arman-tsarukyan-vs-islam-makhachev");
  // Пары из боёв обрабатываются после рейтинга, поэтому в этом кейсе
  // рейтинговый weightClass должен уже присутствовать.
  // Если порядок обратный — weightClass ?? weightClass срабатывает при мердже.
  assert.equal(target?.weightClass, "Lightweight");
});

test("weightClass не перезаписывается нулём, если пара сначала из рейтинга, потом из боя", () => {
  const pairs = buildCuratedPairs({
    groups: GROUPS,
    fightPairs: [{ slugA: "islam-makhachev", slugB: "arman-tsarukyan", isScheduled: true, weightClass: null }],
    resolveSlug: RESOLVE
  });

  const target = pairs.find((pair) => pair.pairSlug === "arman-tsarukyan-vs-islam-makhachev");
  assert.equal(target?.weightClass, "Lightweight");
});

test("rankDepth пары равен худшей позиции из двух бойцов", () => {
  const pairs = buildCuratedPairs({ groups: GROUPS, fightPairs: [], resolveSlug: RESOLVE });
  const byPairSlug = new Map(pairs.map((pair) => [pair.pairSlug, pair]));

  // Чемпион считается глубиной 0, боец с номером N — глубиной N.
  assert.equal(byPairSlug.get("arman-tsarukyan-vs-islam-makhachev")?.rankDepth, 1);
  assert.equal(byPairSlug.get("charles-oliveira-vs-islam-makhachev")?.rankDepth, 2);
  assert.equal(byPairSlug.get("arman-tsarukyan-vs-charles-oliveira")?.rankDepth, 2);
});

test("пара, пришедшая только из боя, остаётся без rankDepth", () => {
  const pairs = buildCuratedPairs({
    groups: [],
    fightPairs: [{ slugA: "sean-omalley", slugB: "aljamain-sterling", isScheduled: true, weightClass: null }],
    resolveSlug: RESOLVE
  });

  assert.equal(pairs[0]?.rankDepth, null);
});

test("в индекс идут пары с реальным боем и верх рейтинга", () => {
  const scheduled = {
    pairSlug: "a-vs-b",
    slugA: "a",
    slugB: "b",
    weightClass: null,
    hasFight: true,
    isScheduled: true,
    rankDepth: null
  };
  const pastFight = { ...scheduled, pairSlug: "c-vs-d", isScheduled: false };
  const topRanked = { ...pastFight, pairSlug: "e-vs-f", hasFight: false, rankDepth: COMPARE_INDEX_RANK_DEPTH };
  const deepRanked = { ...topRanked, pairSlug: "g-vs-h", rankDepth: COMPARE_INDEX_RANK_DEPTH + 1 };

  assert.equal(isIndexableComparisonPair(scheduled), true);
  assert.equal(isIndexableComparisonPair(topRanked), true);
  // Очный бой — единственное, что делает страницу пары уникальной, и именно по
  // таким парам Google давал показы, даже когда бойцы вне топа рейтинга.
  assert.equal(isIndexableComparisonPair(pastFight), true);
  // Комбинаторика рейтинга ниже топа: своего содержания у страницы нет.
  assert.equal(isIndexableComparisonPair(deepRanked), false);
});
