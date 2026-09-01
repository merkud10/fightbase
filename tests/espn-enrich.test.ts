import assert from "node:assert/strict";
import test from "node:test";

const { needsEspnBackfill } = require("../scripts/espn-enrich.js");

// Полностью заполненный боец — эталон, от которого отличаются остальные случаи.
function completeFighter() {
  return {
    photoUrl: "/media/fighters/islam-makhachev.png",
    heightCm: 178,
    reachCm: 179,
    team: "Eagles MMA",
    age: 34
  };
}

test("needsEspnBackfill не трогает полностью заполненного бойца", () => {
  assert.equal(needsEspnBackfill(completeFighter()), false);
});

test("needsEspnBackfill отбирает бойца без фото", () => {
  assert.equal(needsEspnBackfill({ ...completeFighter(), photoUrl: null }), true);
});

test("needsEspnBackfill считает пустую строку в фото отсутствием фото", () => {
  assert.equal(needsEspnBackfill({ ...completeFighter(), photoUrl: "   " }), true);
});

test("needsEspnBackfill отбирает бойца с нулевым ростом", () => {
  assert.equal(needsEspnBackfill({ ...completeFighter(), heightCm: 0 }), true);
});

test("needsEspnBackfill отбирает бойца с нулевым размахом", () => {
  assert.equal(needsEspnBackfill({ ...completeFighter(), reachCm: 0 }), true);
});

test("needsEspnBackfill отбирает бойца с пустым залом", () => {
  assert.equal(needsEspnBackfill({ ...completeFighter(), team: "" }), true);
});

test("needsEspnBackfill отбирает бойца с нулевым возрастом", () => {
  assert.equal(needsEspnBackfill({ ...completeFighter(), age: 0 }), true);
});

// ESPN не отдаёт ударную статистику UFC. Если считать её отсутствие поводом для
// прогона, скрипт будет вечно гонять одних и тех же бойцов вхолостую.
test("needsEspnBackfill игнорирует отсутствие ударной статистики UFC", () => {
  const fighter = { ...completeFighter(), sigStrikesLandedPerMin: null, strikeAccuracy: null };
  assert.equal(needsEspnBackfill(fighter), false);
});
