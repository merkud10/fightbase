import test from "node:test";
import assert from "node:assert/strict";

import { formatFightMethod } from "../lib/display";
import { buildFighterSeo, findFighterRanking } from "../lib/fighter-seo";

const groups = [
  {
    title: "Легчайший вес",
    champion: { name: "Merab Dvalishvili", officialSlug: "merab-dvalishvili", imageUrl: null },
    rows: [
      { rank: 1, name: "Umar Nurmagomedov", officialSlug: "umar-nurmagomedov" },
      { rank: 8, name: "Song Yadong", officialSlug: "song-yadong" }
    ]
  },
  {
    title: "Men's Pound-for-Pound",
    champion: { name: "Islam Makhachev", officialSlug: "islam-makhachev", imageUrl: null },
    rows: [{ rank: 1, name: "Islam Makhachev", officialSlug: "islam-makhachev" }]
  }
];
const resolveSlug = (officialSlug: string, name: string) =>
  ({ "song-yadong": "yadong-song", "merab-dvalishvili": "merab-dvalishvili", "islam-makhachev": "islam-makhachev" })[officialSlug] ??
  (name === "Umar Nurmagomedov" ? "umar-nurmagomedov" : null);

test("findFighterRanking returns division rank, champion status, and skips pound-for-pound", () => {
  assert.deepEqual(findFighterRanking(groups, resolveSlug, "yadong-song"), { division: "Легчайший вес", rank: 8, champion: false });
  assert.deepEqual(findFighterRanking(groups, resolveSlug, "merab-dvalishvili"), { division: "Легчайший вес", rank: 0, champion: true });
  assert.deepEqual(findFighterRanking(groups, resolveSlug, "umar-nurmagomedov"), { division: "Легчайший вес", rank: 1, champion: false });
  // Махачев есть только в P4P — дивизионной позиции нет.
  assert.equal(findFighterRanking(groups, resolveSlug, "islam-makhachev"), null);
  assert.equal(findFighterRanking(groups, resolveSlug, "nobody"), null);
});

const fighter = {
  name: "Song Yadong",
  nameRu: "Сонг Ядонг",
  nickname: "Kung Fu Kid",
  record: "22-9-1",
  weightClass: "Bantamweight",
  country: "Китай",
  age: 28,
  team: "Team Alpha Male",
  status: "active"
};

test("buildFighterSeo writes a name-query title with record and a description with rank, next fight and country", () => {
  const seo = buildFighterSeo({
    fighter,
    ranking: { division: "Легчайший вес", rank: 8, champion: false },
    nextFight: { opponentName: "Умар Нурмагомедов", eventName: "UFC 336", dateLabel: "14 февраля 2027" },
    lastFight: null,
    locale: "ru"
  });
  assert.equal(seo.title, "Сонг Ядонг (Song Yadong): рекорд 22-9-1, статистика и бои UFC");
  assert.match(seo.description, /^Сонг Ядонг «Kung Fu Kid» — боец UFC \(Китай\), №8 легчайшего веса, рекорд 22-9-1, 28 лет\./);
  assert.match(seo.description, /Следующий бой: Умар Нурмагомедов, UFC 336, 14 февраля 2027\./);
  assert.deepEqual(seo.heroBits, ["№8 легчайшего веса", "22-9-1", "Легчайший вес", "Китай", "28 лет", "Team Alpha Male"]);
});

test("buildFighterSeo handles a champion without next fight and falls back to the last result", () => {
  const seo = buildFighterSeo({
    fighter: { ...fighter, name: "Merab Dvalishvili", nameRu: "Мераб Двалишвили", nickname: null, record: "20-4-0", country: "Грузия", age: null, team: null, status: "champion" },
    ranking: { division: "Легчайший вес", rank: 0, champion: true },
    nextFight: null,
    lastFight: { opponentName: "Шон О'Мэлли", result: "Победа", dateLabel: "25 января 2026" },
    locale: "ru"
  });
  assert.equal(seo.title, "Мераб Двалишвили (Merab Dvalishvili): рекорд 20-4-0, статистика и бои UFC");
  assert.match(seo.description, /чемпион UFC в легчайшем весе/);
  assert.match(seo.description, /Последний бой: Шон О'Мэлли, победа, 25 января 2026\./);
  assert.equal(seo.heroBits[0], "Чемпион UFC");
});

test("buildFighterSeo keeps English output for the en locale and omits empty parts", () => {
  const seo = buildFighterSeo({
    fighter: { ...fighter, nameRu: null, nickname: null, record: "", country: "", age: null, team: null },
    ranking: null,
    nextFight: null,
    lastFight: null,
    locale: "en"
  });
  assert.equal(seo.title, "Song Yadong: UFC record, stats and fights");
  assert.match(seo.description, /^Song Yadong — UFC bantamweight fighter\./);
  assert.deepEqual(seo.heroBits, ["Bantamweight"]);
});

test("formatFightMethod translates verbose decision and stoppage strings", () => {
  assert.equal(formatFightMethod("three round technical decision", "ru"), "Техническое решение (3 раунда)");
  assert.equal(formatFightMethod("five round unanimous decision", "ru"), "Единогласное решение (5 раундов)");
  assert.equal(formatFightMethod("three round split decision", "ru"), "Раздельное решение (3 раунда)");
  assert.equal(formatFightMethod("Decision - Unanimous", "ru"), "Единогласное решение");
  assert.equal(formatFightMethod("something odd", "ru"), "something odd");
});
