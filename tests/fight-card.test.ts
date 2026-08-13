import assert from "node:assert/strict";
import test from "node:test";

import { formatWinnerlessFightResult, getMainEventFight, sortFightsForCard } from "../lib/fight-card";

test("fight cards prefer an explicit main event, then stage and bout order", () => {
  const fights = [
    { id: "prelim", stage: "prelims", boutOrder: 1, isMainEvent: false },
    { id: "co-main", stage: "main_card", boutOrder: 2, isMainEvent: false },
    { id: "main", stage: "main_card", boutOrder: 9, isMainEvent: true },
    { id: "main-card", stage: "main_card", boutOrder: 3, isMainEvent: false }
  ];

  assert.deepEqual(sortFightsForCard(fights).map((fight) => fight.id), ["main", "co-main", "main-card", "prelim"]);
  assert.equal(getMainEventFight(fights)?.id, "main");
});

test("fight-card fallback is stable when explicit placement is missing", () => {
  const fights = [
    { id: "later-id", stage: "main_card", createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "earlier-id", stage: "main_card", createdAt: "2026-01-01T00:00:00.000Z" }
  ];

  assert.deepEqual(sortFightsForCard(fights).map((fight) => fight.id), ["earlier-id", "later-id"]);
});

test("winner-less results only label explicit draws and no contests", () => {
  assert.equal(formatWinnerlessFightResult("draw", "ru"), "Ничья");
  assert.equal(formatWinnerlessFightResult("no_contest", "en"), "No contest (NC)");
  assert.equal(formatWinnerlessFightResult(null, "ru"), "Результат уточняется");
  assert.equal(formatWinnerlessFightResult("win", "en"), "Result pending verification");
});
