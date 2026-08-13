import test from "node:test";
import assert from "node:assert/strict";

import { formatWeightClass } from "../lib/display";
import { fetchUfcOfficialRankings, isPoundForPoundRankingGroup } from "../lib/ufc-rankings";

const realFetch = globalThis.fetch;

function mockFetch(impl: () => Promise<Response>) {
  globalThis.fetch = (async () => impl()) as typeof fetch;
}

test("fetchUfcOfficialRankings returns [] on a non-OK upstream response (no throw)", async () => {
  mockFetch(async () => new Response("blocked", { status: 403 }));
  try {
    const groups = await fetchUfcOfficialRankings();
    assert.deepEqual(groups, []);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("fetchUfcOfficialRankings returns [] when the upstream fetch rejects (network/timeout)", async () => {
  mockFetch(async () => {
    throw new Error("network down");
  });
  try {
    const groups = await fetchUfcOfficialRankings();
    assert.deepEqual(groups, []);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("fetchUfcOfficialRankings keeps pound-for-pound groups and strips a tagged Top Rank suffix", async () => {
  const html = `
    <div class="view-grouping-header">Men's Pound-for-Pound <span>Top Rank</span></div>
    <div class="view-grouping-content"><table class="cols-0">
      <caption><h5><a href="/athlete/islam-makhachev">Islam Makhachev</a></h5></caption>
      <img src="https://img.example/makhachev.png" />
      <tbody>
        <tr>
          <td class="views-field views-field-weight-class-rank">1</td>
          <td class="views-field views-field-name"><a href="/athlete/islam-makhachev">Islam Makhachev</a></td>
          <td class="views-field views-field-weight-class-rank-change"></td>
        </tr>
        <tr>
          <td class="views-field views-field-weight-class-rank">2</td>
          <td class="views-field views-field-name"><a href="/athlete/alexander-volkanovski">Alexander Volkanovski</a></td>
          <td class="views-field views-field-weight-class-rank-change"></td>
        </tr>
      </tbody>
    </table></div>`;
  mockFetch(async () => new Response(html, { status: 200 }));
  try {
    const groups = await fetchUfcOfficialRankings();
    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.title, "Men's Pound-for-Pound");
    assert.equal(groups[0]?.champion.name, "Islam Makhachev");
    assert.deepEqual(
      groups[0]?.rows.map((fighter) => [fighter.rank, fighter.name]),
      [
        [1, "Islam Makhachev"],
        [2, "Alexander Volkanovski"]
      ]
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("isPoundForPoundRankingGroup recognizes official and legacy titles", () => {
  assert.equal(isPoundForPoundRankingGroup("Men's Pound-for-Pound"), true);
  assert.equal(isPoundForPoundRankingGroup("Women's Pound-for-Pound Top Rank"), true);
  assert.equal(isPoundForPoundRankingGroup("Вне зависимости от категорий"), true);
  assert.equal(isPoundForPoundRankingGroup("Женский, вне весовых категорий"), true);
  assert.equal(isPoundForPoundRankingGroup("Flyweight"), false);
  assert.equal(isPoundForPoundRankingGroup("Наилегчайший вес"), false);
});

test("formatWeightClass localizes official and legacy pound-for-pound titles", () => {
  assert.equal(formatWeightClass("Men's Pound-for-Pound", "ru"), "Вне весовых категорий (P4P)");
  assert.equal(formatWeightClass("Women's Pound-for-Pound", "ru"), "Женский, вне весовых категорий (P4P)");
  assert.equal(formatWeightClass("Вне зависимости от категорий", "ru"), "Вне весовых категорий (P4P)");
  assert.equal(formatWeightClass("Женский, вне весовых категорий", "ru"), "Женский, вне весовых категорий (P4P)");
  assert.equal(formatWeightClass("Men's Pound-for-Pound", "en"), "Men's Pound-for-Pound");
});

test("fetchUfcOfficialRankings parses divisional groups on an OK response", async () => {
  const html = `
    <div class="view-grouping-header">Flyweight Top Rank</div>
    <div class="view-grouping-content"><table class="cols-0">
      <caption><h5><a href="/athlete/champ-guy">Champ Guy</a></h5></caption>
      <img src="https://img.example/champ.png" />
      <tbody>
        <tr>
          <td class="views-field views-field-weight-class-rank">1</td>
          <td class="views-field views-field-name"><a href="/athlete/contender-one">Contender One</a></td>
          <td class="views-field views-field-weight-class-rank-change">&mdash;</td>
        </tr>
        <tr>
          <td class="views-field views-field-weight-class-rank">2</td>
          <td class="views-field views-field-name"><a href="/athlete/contender-two">Contender Two</a></td>
          <td class="views-field views-field-weight-class-rank-change"></td>
        </tr>
      </tbody>
    </table></div>`;
  mockFetch(async () => new Response(html, { status: 200 }));
  try {
    const groups = await fetchUfcOfficialRankings();
    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.title, "Flyweight");
    assert.equal(groups[0]?.champion.name, "Champ Guy");
    assert.equal(groups[0]?.rows.length, 2);
    assert.deepEqual(
      groups[0]?.rows.map((fighter) => fighter.rank),
      [1, 2]
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});
