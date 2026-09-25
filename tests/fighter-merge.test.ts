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
