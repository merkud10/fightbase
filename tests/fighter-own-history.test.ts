import assert from "node:assert/strict";
import test from "node:test";

import { buildHistoryFromOwnFights, mergeOwnFightsIntoHistory, type OwnFight } from "../lib/fighter-own-history";

const { findSuspectedDuplicates } = require("../scripts/fighter-name-matching.js");

const self = { slug: "gabriel-lorenco", name: "Gabriel Lorenço", nameRu: "Габриэль Лоренсо" };
const petersen = { slug: "thomas-petersen", name: "Thomas Petersen", nameRu: "Томас Петерсен" };

function fight(overrides: Partial<OwnFight>): OwnFight {
  return {
    id: "f1",
    slug: "gabriel-lorenco-vs-thomas-petersen",
    status: "completed",
    resultType: "win",
    winnerFighterId: "petersen",
    method: "KO/TKO",
    resultRound: 3,
    resultTime: "4:47",
    weightClass: "Heavyweight",
    fighterAId: "self",
    fighterBId: "petersen",
    fighterA: self,
    fighterB: petersen,
    event: {
      name: "UFC Fight Night: Cortes Acosta vs. Walker",
      slug: "ufc-fight-night-cortes-acosta-vs-walker",
      date: new Date("2026-11-08T00:00:00Z")
    },
    predictionSnapshot: { id: "p1" },
    ...overrides
  };
}

const dwcs = { name: "DWCS", slug: "dwcs-10-4", date: new Date("2026-09-15T00:00:00Z") };

test("own fights become history entries with the result seen from the fighter's side", () => {
  const [entry] = buildHistoryFromOwnFights([fight({})], "self");
  assert.equal(entry?.result, "Поражение");
  assert.equal(entry?.opponentNameRu, "Томас Петерсен");
  assert.equal(entry?.opponentSlug, "thomas-petersen");
  assert.equal(entry?.eventSlug, "ufc-fight-night-cortes-acosta-vs-walker");
  assert.equal(entry?.predictionSlug, "gabriel-lorenco-vs-thomas-petersen");
  assert.deepEqual([entry?.method, entry?.round, entry?.time], ["KO/TKO", 3, "4:47"]);

  assert.equal(buildHistoryFromOwnFights([fight({})], "petersen")[0]?.result, "Победа");
  assert.equal(buildHistoryFromOwnFights([fight({ resultType: "draw", winnerFighterId: null })], "self")[0]?.result, "Ничья");
  assert.equal(
    buildHistoryFromOwnFights([fight({ resultType: "no_contest", winnerFighterId: null })], "self")[0]?.result,
    "Несостоявшийся бой"
  );
});

test("scheduled fights, fights without a known outcome and TBA opponents stay out of the history", () => {
  const fights = [
    fight({ id: "a", status: "scheduled", resultType: null, winnerFighterId: null }),
    fight({ id: "b", resultType: null, winnerFighterId: null }),
    fight({ id: "c", fighterB: { slug: "opponent-tba", name: "TBA", nameRu: null } }),
    fight({ id: "d", predictionSnapshot: null })
  ];
  const entries = buildHistoryFromOwnFights(fights, "self");
  assert.deepEqual(
    entries.map((entry) => entry.id),
    ["own-d"]
  );
  assert.equal(entries[0]?.predictionSlug, null);
});

test("own history is sorted from the newest fight", () => {
  const entries = buildHistoryFromOwnFights([fight({ id: "old", event: dwcs }), fight({ id: "new" })], "self");
  assert.deepEqual(
    entries.map((entry) => entry.id),
    ["own-new", "own-old"]
  );
});

test("merge adds only fights newer than the profile history and never repeats the same fight", () => {
  const own = buildHistoryFromOwnFights([fight({ id: "new" }), fight({ id: "old", event: dwcs })], "self");
  const ids = (entries: Array<{ id: string }>) => entries.map((entry) => entry.id);

  // Профиль без истории: показываем всё, что знаем сами.
  assert.deepEqual(ids(mergeOwnFightsIntoHistory<{ id: string; date: Date }>([], own)), ["own-new", "own-old"]);

  // Профиль обновлялся до турнира: добавляется только свежий бой.
  const beforeEvent = [{ id: "espn-dwcs", date: new Date("2026-09-15T00:00:00Z") }];
  assert.deepEqual(ids(mergeOwnFightsIntoHistory(beforeEvent, own)), ["own-new", "espn-dwcs"]);

  // Профиль уже знает этот бой (дата сдвинута на сутки из-за часового пояса): повтора нет.
  const afterEvent = [
    { id: "espn-petersen", date: new Date("2026-11-07T00:00:00Z") },
    { id: "espn-dwcs", date: new Date("2026-09-15T00:00:00Z") }
  ];
  assert.deepEqual(ids(mergeOwnFightsIntoHistory(afterEvent, own)), ["espn-petersen", "espn-dwcs"]);
});

test("roster sync reports an empty name twin of a fighter that holds the ESPN id", () => {
  const fighters = [
    { id: "1", slug: "gabriel-lourenco", name: "Gabriel Lourenço", espnId: "5215710" },
    { id: "2", slug: "gabriel-lorenco", name: "Gabriel Lorenço", espnId: null },
    { id: "3", slug: "thomas-petersen", name: "Thomas Petersen", espnId: "4869702" }
  ];
  const competitors = [
    { espnId: "5215710", fullName: "Gabriel Lorenço" },
    { espnId: "4869702", fullName: "Thomas Petersen" },
    { espnId: "999", fullName: "Somebody New" }
  ];
  assert.deepEqual(findSuspectedDuplicates(competitors, fighters), [
    { duplicate: "gabriel-lorenco", canonical: "gabriel-lourenco", espnId: "5215710" }
  ]);
  assert.deepEqual(
    findSuspectedDuplicates(
      competitors,
      fighters.filter((fighter) => fighter.id !== "2")
    ),
    []
  );
});
