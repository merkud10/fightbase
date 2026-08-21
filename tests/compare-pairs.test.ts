import assert from "node:assert/strict";
import test from "node:test";

import { buildPairSlug, isCanonicalPairOrder, splitPairSlugCandidates } from "../lib/compare-pairs";

test("buildPairSlug сортирует слаги лексикографически", () => {
  assert.equal(buildPairSlug("sean-omalley", "aljamain-sterling"), "aljamain-sterling-vs-sean-omalley");
  assert.equal(buildPairSlug("aljamain-sterling", "sean-omalley"), "aljamain-sterling-vs-sean-omalley");
});

// Тест-сторож: пара, различающаяся на дефисе, проверяет, что порядок задаётся
// именно побайтовым сравнением. Дефис ('-', 0x2D) меньше любой строчной буквы,
// поэтому o-malley < omalley и должен стоять первым.
test("buildPairSlug: дефис сортируется раньше буквы (побайтовое сравнение)", () => {
  assert.equal(buildPairSlug("omalley", "o-malley"), "o-malley-vs-omalley");
  assert.equal(buildPairSlug("o-malley", "omalley"), "o-malley-vs-omalley");
});

// Фиксируем поведение при одинаковых слагах: модуль намеренно не валидирует,
// что бойцы разные — это делает вызывающий код.
test("buildPairSlug при одинаковых слагах", () => {
  assert.equal(buildPairSlug("jon-jones", "jon-jones"), "jon-jones-vs-jon-jones");
});

test("isCanonicalPairOrder различает канонический и обратный порядок", () => {
  assert.equal(isCanonicalPairOrder("aljamain-sterling", "sean-omalley"), true);
  assert.equal(isCanonicalPairOrder("sean-omalley", "aljamain-sterling"), false);
});

test("isCanonicalPairOrder при одинаковых слагах возвращает true", () => {
  assert.equal(isCanonicalPairOrder("jon-jones", "jon-jones"), true);
});

test("splitPairSlugCandidates возвращает единственный разрез для обычного слага", () => {
  assert.deepEqual(splitPairSlugCandidates("aljamain-sterling-vs-sean-omalley"), [
    { a: "aljamain-sterling", b: "sean-omalley" }
  ]);
});

test("splitPairSlugCandidates перебирает все разрезы, если -vs- встречается несколько раз", () => {
  assert.deepEqual(splitPairSlugCandidates("a-vs-b-vs-c"), [
    { a: "a", b: "b-vs-c" },
    { a: "a-vs-b", b: "c" }
  ]);
});

test("splitPairSlugCandidates отвергает пути без разделителя и с пустой стороной", () => {
  assert.deepEqual(splitPairSlugCandidates("odinokiy-boec"), []);
  assert.deepEqual(splitPairSlugCandidates("-vs-sean-omalley"), []);
  assert.deepEqual(splitPairSlugCandidates("sean-omalley-vs-"), []);
});

// Нормализация регистра: URL может прийти в смешанном регистре,
// splitPairSlugCandidates обязана отдавать кандидатов в нижнем регистре.
test("splitPairSlugCandidates приводит входную строку к нижнему регистру", () => {
  assert.deepEqual(splitPairSlugCandidates("Jon-Jones-vs-Aljamain-Sterling"), [
    { a: "jon-jones", b: "aljamain-sterling" }
  ]);
  assert.deepEqual(splitPairSlugCandidates("SEAN-OMALLEY-VS-JON-JONES"), [
    { a: "sean-omalley", b: "jon-jones" }
  ]);
});
