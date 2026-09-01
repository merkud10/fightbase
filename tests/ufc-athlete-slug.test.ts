import test from "node:test";
import assert from "node:assert/strict";

import { extractEnglishAthleteSlug } from "../lib/ufc-athlete-slug";

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
