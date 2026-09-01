import test from "node:test";
import assert from "node:assert/strict";

import {
  applyAthleteSlugAliases,
  collectAthleteSlugs,
  extractEnglishAthleteSlug,
  resolveAthleteSlugAliases
} from "../lib/ufc-athlete-slug";
import type { UfcOfficialRankingGroup } from "../lib/ufc-rankings";

// Реальная разметка ufc.ru: языковых альтернатив много, и en-zxx идёт первым.
// Брать нужно ровно hreflang="en", иначе региональные варианты дадут ложное совпадение.
const ATHLETE_HTML = `
  <link rel="canonical" href="https://ufc.ru/athlete/dzhastin-getzhi">
  <link rel="alternate" hreflang="en-zxx" href="https://ufc.ru/athlete/justin-gaethje">
  <link rel="alternate" hreflang="en" href="https://ufc.ru/athlete/justin-gaethje">
  <link rel="alternate" hreflang="en-aus" href="https://ufc.ru/athlete/justin-gaethje">
  <link rel="alternate" hreflang="ru" href="https://ufc.ru/athlete/dzhastin-getzhi">
`;

test("extractEnglishAthleteSlug берёт слаг из hreflang=en", () => {
  assert.equal(extractEnglishAthleteSlug(ATHLETE_HTML), "justin-gaethje");
});

test("extractEnglishAthleteSlug чинит переиспользованный слаг UFC", () => {
  // Тацуро Таира лежит под слагом, доставшимся от другого бойца.
  const html = `<link rel="alternate" hreflang="en" href="https://ufc.ru/athlete/tatsuro-taira">`;
  assert.equal(extractEnglishAthleteSlug(html), "tatsuro-taira");
});

test("extractEnglishAthleteSlug терпит другой порядок атрибутов", () => {
  const html = `<link href="https://ufc.ru/athlete/tom-aspinall" hreflang="en" rel="alternate" />`;
  assert.equal(extractEnglishAthleteSlug(html), "tom-aspinall");
});

test("extractEnglishAthleteSlug возвращает null без hreflang=en", () => {
  const html = `<link rel="alternate" hreflang="ru" href="https://ufc.ru/athlete/petr-yan">`;
  assert.equal(extractEnglishAthleteSlug(html), null);
});

test("extractEnglishAthleteSlug возвращает null, если href не ведёт на атлета", () => {
  const html = `<link rel="alternate" hreflang="en" href="https://ufc.ru/rankings">`;
  assert.equal(extractEnglishAthleteSlug(html), null);
});

function makeGroups(): UfcOfficialRankingGroup[] {
  return [
    {
      title: "Легкий вес",
      champion: { name: "Ислам Махачев", officialSlug: "islam-makhachev", imageUrl: null },
      rows: [
        { rank: 1, name: "Джастин Гейджи", officialSlug: "dzhastin-getzhi", badge: null },
        { rank: 2, name: "Бенуа Сэн-Дени", officialSlug: "mariya-agapova-0", badge: null }
      ]
    }
  ];
}

test("collectAthleteSlugs собирает слаги чемпионов и строк без дублей", () => {
  const groups = makeGroups();
  groups[0]!.rows.push({ rank: 3, name: "Ислам Махачев", officialSlug: "islam-makhachev", badge: null });

  assert.deepEqual(collectAthleteSlugs(groups), ["islam-makhachev", "dzhastin-getzhi", "mariya-agapova-0"]);
});

test("applyAthleteSlugAliases подставляет английские слаги", () => {
  const resolved = new Map([
    ["dzhastin-getzhi", "justin-gaethje"],
    ["mariya-agapova-0", "benoit-saint-denis"]
  ]);

  const result = applyAthleteSlugAliases(makeGroups(), resolved);

  assert.deepEqual(
    result[0]?.rows.map((row) => row.officialSlug),
    ["justin-gaethje", "benoit-saint-denis"]
  );
});

test("applyAthleteSlugAliases сохраняет неразрешённый слаг как есть", () => {
  const result = applyAthleteSlugAliases(makeGroups(), new Map([["dzhastin-getzhi", "justin-gaethje"]]));

  // Резолв не удался — оставляем русский слаг, строка упадёт на матч по имени.
  assert.equal(result[0]?.rows[1]?.officialSlug, "mariya-agapova-0");
  assert.equal(result[0]?.champion.officialSlug, "islam-makhachev");
});

test("applyAthleteSlugAliases не мутирует исходные группы", () => {
  const groups = makeGroups();
  applyAthleteSlugAliases(groups, new Map([["dzhastin-getzhi", "justin-gaethje"]]));

  assert.equal(groups[0]?.rows[0]?.officialSlug, "dzhastin-getzhi");
});

function htmlFor(slug: string) {
  return `<link rel="alternate" hreflang="en" href="https://ufc.ru/athlete/${slug}">`;
}

test("resolveAthleteSlugAliases берёт известные слаги из кэша без запросов", async () => {
  const requested: string[] = [];

  const result = await resolveAthleteSlugAliases({
    slugs: ["dzhastin-getzhi"],
    known: new Map([["dzhastin-getzhi", "justin-gaethje"]]),
    fetchHtml: async (slug) => {
      requested.push(slug);
      return htmlFor("wrong");
    }
  });

  assert.deepEqual(requested, []);
  assert.equal(result.resolved.get("dzhastin-getzhi"), "justin-gaethje");
  assert.deepEqual(result.discovered, []);
});

test("resolveAthleteSlugAliases возвращает новые соответствия для записи", async () => {
  const result = await resolveAthleteSlugAliases({
    slugs: ["tom-aspinell", "dzheremaya-uells-0"],
    known: new Map(),
    fetchHtml: async (slug) => htmlFor(slug === "tom-aspinell" ? "tom-aspinall" : "tatsuro-taira")
  });

  assert.equal(result.resolved.get("tom-aspinell"), "tom-aspinall");
  assert.equal(result.resolved.get("dzheremaya-uells-0"), "tatsuro-taira");
  assert.deepEqual(
    [...result.discovered].sort((a, b) => a.officialSlug.localeCompare(b.officialSlug)),
    [
      { officialSlug: "dzheremaya-uells-0", englishSlug: "tatsuro-taira" },
      { officialSlug: "tom-aspinell", englishSlug: "tom-aspinall" }
    ]
  );
});

test("resolveAthleteSlugAliases переживает падение отдельного атлета", async () => {
  const result = await resolveAthleteSlugAliases({
    slugs: ["broken", "tom-aspinell"],
    known: new Map(),
    fetchHtml: async (slug) => {
      if (slug === "broken") throw new Error("network down");
      return htmlFor("tom-aspinall");
    }
  });

  assert.equal(result.resolved.has("broken"), false);
  assert.equal(result.resolved.get("tom-aspinell"), "tom-aspinall");
});

test("resolveAthleteSlugAliases пропускает страницу без hreflang", async () => {
  const result = await resolveAthleteSlugAliases({
    slugs: ["no-alternate"],
    known: new Map(),
    fetchHtml: async () => "<html><head></head></html>"
  });

  assert.equal(result.resolved.size, 0);
  assert.deepEqual(result.discovered, []);
});

test("resolveAthleteSlugAliases останавливается по исчерпании бюджета", async () => {
  let clock = 0;
  const requested: string[] = [];

  const result = await resolveAthleteSlugAliases({
    slugs: ["a", "b", "c"],
    known: new Map(),
    concurrency: 1,
    budgetMs: 100,
    now: () => clock,
    fetchHtml: async (slug) => {
      requested.push(slug);
      clock += 60; // каждый запрос «съедает» 60 мс
      return htmlFor(`${slug}-en`);
    }
  });

  // Бюджет проверяется перед каждым запросом: два успевают, третий уже нет.
  assert.deepEqual(requested, ["a", "b"]);
  assert.equal(result.resolved.size, 2);
});
