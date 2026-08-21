import assert from "node:assert/strict";
import test from "node:test";

import { buildPairSlug, isCanonicalPairSlug, splitPairSlugCandidates } from "../lib/compare-pairs";

test("buildPairSlug сортирует слаги лексикографически", () => {
  assert.equal(buildPairSlug("sean-omalley", "aljamain-sterling"), "aljamain-sterling-vs-sean-omalley");
  assert.equal(buildPairSlug("aljamain-sterling", "sean-omalley"), "aljamain-sterling-vs-sean-omalley");
});

test("isCanonicalPairSlug различает канонический и обратный порядок", () => {
  assert.equal(isCanonicalPairSlug("aljamain-sterling", "sean-omalley"), true);
  assert.equal(isCanonicalPairSlug("sean-omalley", "aljamain-sterling"), false);
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
