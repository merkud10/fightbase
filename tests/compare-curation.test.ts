import assert from "node:assert/strict";
import test from "node:test";

import { buildCuratedPairs } from "../lib/compare-curation";

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
    fightPairs: [{ slugA: "sean-omalley", slugB: "aljamain-sterling", isScheduled: true }],
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
    fightPairs: [{ slugA: "islam-makhachev", slugB: "arman-tsarukyan", isScheduled: true }],
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
    fightPairs: [{ slugA: "sean-omalley", slugB: "aljamain-sterling", isScheduled: false }],
    resolveSlug: RESOLVE
  });

  assert.deepEqual(pairs.map((pair) => pair.pairSlug), ["aljamain-sterling-vs-sean-omalley"]);
});

test("боец сам с собой в набор не попадает", () => {
  const pairs = buildCuratedPairs({
    groups: [],
    fightPairs: [{ slugA: "sean-omalley", slugB: "sean-omalley", isScheduled: false }],
    resolveSlug: RESOLVE
  });

  assert.deepEqual(pairs, []);
});

test("слаги в паре хранятся в каноническом порядке", () => {
  const pairs = buildCuratedPairs({
    groups: [],
    fightPairs: [{ slugA: "sean-omalley", slugB: "aljamain-sterling", isScheduled: false }],
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
    fightPairs: [{ slugA: "arman-tsarukyan", slugB: "islam-makhachev", isScheduled: false }],
    resolveSlug: RESOLVE
  });

  const target = pairs.find((pair) => pair.pairSlug === "arman-tsarukyan-vs-islam-makhachev");
  // Пары из боёв обрабатываются после рейтинга, поэтому в этом кейсе
  // рейтинговый weightClass должен уже присутствовать.
  // Если порядок обратный — weightClass ?? weightClass срабатывает при мердже.
  assert.equal(target?.weightClass, "Легкий вес");
});

test("weightClass не перезаписывается нулём, если пара сначала из рейтинга, потом из боя", () => {
  const pairs = buildCuratedPairs({
    groups: GROUPS,
    fightPairs: [{ slugA: "islam-makhachev", slugB: "arman-tsarukyan", isScheduled: true }],
    resolveSlug: RESOLVE
  });

  const target = pairs.find((pair) => pair.pairSlug === "arman-tsarukyan-vs-islam-makhachev");
  assert.equal(target?.weightClass, "Легкий вес");
});
