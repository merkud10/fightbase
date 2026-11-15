import test from "node:test";
import assert from "node:assert/strict";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { planFieldMerge, totalBouts } = require("../scripts/fighter-merge.js");

const base = {
  espnId: null,
  nameRu: "Ян Блахович",
  photoUrl: "/media/fighters/a.avif",
  country: "Польша",
  weightClass: "Light Heavyweight",
  team: "",
  bio: "",
  age: 42,
  heightCm: 0,
  reachCm: 0,
  record: "29-11-2",
  strikeAccuracy: null
};

test("totalBouts суммирует победы, поражения и ничьи", () => {
  assert.equal(totalBouts("36-17-1"), 54);
  assert.equal(totalBouts(""), 0);
  assert.equal(totalBouts("18-3-0 (1 NC)"), 21);
});

test("основной профиль добирает только пустые поля", () => {
  const loser = { ...base, espnId: "2506250", nameRu: "Другое имя", team: "Ankos MMA", heightCm: 188, strikeAccuracy: 49, record: "29-12-2" };
  assert.deepEqual(planFieldMerge(base, loser), {
    espnId: "2506250",
    team: "Ankos MMA",
    heightCm: 188,
    strikeAccuracy: 49,
    record: "29-12-2"
  });
});

test("рекорд с меньшим числом боёв не затирает свежий", () => {
  assert.deepEqual(planFieldMerge({ ...base, record: "36-17-1" }, { ...base, record: "34-17-1" }), {});
});

test("пустая заглушка ничего не портит", () => {
  const stub = { espnId: null, nameRu: null, photoUrl: null, country: "", weightClass: "", team: "", bio: "", age: 0, heightCm: 0, reachCm: 0, record: "" };
  assert.deepEqual(planFieldMerge(base, stub), {});
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { planDuplicateFightResult } = require("../scripts/fighter-merge.js");

// Шон Кинг — Джесси Росас, Noche UFC 12.09.2026: копия боя на основном профиле
// застыла без победителя, результат был только на копии дубля «Sean King III».
const staleKeeperFight = { status: "completed", resultType: null, winnerFighterId: null, method: "KO/TKO", resultRound: 1, resultTime: "4:24" };
const settledLoserFight = { status: "completed", resultType: "win", winnerFighterId: "king-iii", method: "KO/TKO", resultRound: 1, resultTime: "0:36" };

test("результат с копии дубля переезжает на бой основного профиля", () => {
  assert.deepEqual(planDuplicateFightResult(staleKeeperFight, settledLoserFight, "king", "king-iii"), {
    status: "completed",
    resultType: "win",
    winnerFighterId: "king",
    method: "KO/TKO",
    resultRound: 1,
    resultTime: "0:36"
  });
  assert.equal(
    planDuplicateFightResult({ ...staleKeeperFight, status: "scheduled" }, { ...settledLoserFight, winnerFighterId: "rosas" }, "king", "king-iii")?.winnerFighterId,
    "rosas"
  );
  assert.equal(
    planDuplicateFightResult(staleKeeperFight, { ...settledLoserFight, resultType: "draw", winnerFighterId: null }, "king", "king-iii")?.resultType,
    "draw"
  );
});

test("бой основного профиля с известным исходом не перезаписывается", () => {
  const settledKeeperFight = { ...settledLoserFight, winnerFighterId: "king" };
  assert.equal(planDuplicateFightResult(settledKeeperFight, { ...settledLoserFight, winnerFighterId: "rosas" }, "king", "king-iii"), null);
  assert.equal(planDuplicateFightResult(staleKeeperFight, { ...staleKeeperFight }, "king", "king-iii"), null);
  assert.equal(planDuplicateFightResult(staleKeeperFight, { ...settledLoserFight, status: "scheduled", resultType: null, winnerFighterId: null }, "king", "king-iii"), null);
});
