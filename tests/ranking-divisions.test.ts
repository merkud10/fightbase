import test from "node:test";
import assert from "node:assert/strict";

import { findRankingDivision, getRankingDivisionBySlug, RANKING_DIVISIONS } from "../lib/ranking-divisions";

test("русские и английские названия дивизиона ведут к одному слагу", () => {
  assert.equal(findRankingDivision("Легкий вес")?.slug, "lightweight");
  assert.equal(findRankingDivision("Lightweight")?.slug, "lightweight");
  assert.equal(findRankingDivision("  легкий   вес ")?.slug, "lightweight");
  assert.equal(findRankingDivision("Лёгкий вес")?.slug, "lightweight");
});

test("P4P и женские дивизионы не путаются с мужскими", () => {
  assert.equal(findRankingDivision("Вне зависимости от категорий")?.slug, "pound-for-pound");
  assert.equal(findRankingDivision("Вне зависимости от категорий Top Rank")?.slug, "pound-for-pound");
  assert.equal(findRankingDivision("Men's Pound-for-Pound")?.slug, "pound-for-pound");
  assert.equal(findRankingDivision("Женский, вне весовых категорий")?.slug, "womens-pound-for-pound");
  assert.equal(findRankingDivision("Women's Pound-for-Pound")?.slug, "womens-pound-for-pound");
  assert.equal(findRankingDivision("Женский легчайший вес")?.slug, "womens-bantamweight");
  assert.equal(findRankingDivision("Легчайший вес")?.slug, "bantamweight");
  assert.equal(findRankingDivision("Women's Strawweight")?.slug, "womens-strawweight");
});

test("незнакомое название не угадывается", () => {
  assert.equal(findRankingDivision("Catchweight"), null);
  assert.equal(getRankingDivisionBySlug("catchweight"), null);
});

test("слаги уникальны и ищутся обратно", () => {
  const slugs = RANKING_DIVISIONS.map((division) => division.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const division of RANKING_DIVISIONS) {
    assert.equal(getRankingDivisionBySlug(division.slug), division);
    assert.match(division.slug, /^[a-z-]+$/);
  }
});
