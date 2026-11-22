import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { askModel, collectUnmatchedOpponents, isRealOpponentName, pickValidNames } = require("../scripts/fix-opponent-names.js");

test("only a first and last name in Latin counts as an opponent to rename", () => {
  assert.equal(isRealOpponentName("Tyron Woodley"), true);
  assert.equal(isRealOpponentName("Ovince Saint Preux"), true);
  // Одиночная фамилия, мусор разбора, заглушки и уже русские имена модели не отдаём.
  for (const junk of ["Silva", "continue", "Opponent TBA", "TBD", "Иван Петров", "", "Fighter 2", "Pat Healy was changed", "Nicolas Dalby was overturned"]) {
    assert.equal(isRealOpponentName(junk), false, junk);
  }
});

test("opponents with their own profile are left to the profile name", () => {
  const fighters = [
    { slug: "dustin-poirier", name: "Dustin Poirier", nameRu: "Дастин Порье" },
    // Два профиля с одним ключом: карточка неоднозначна, имя остаётся за историей.
    { slug: "bruno-silva", name: "Bruno Silva", nameRu: "Бруно Силва" },
    { slug: "bruno-silva-2", name: "Bruno Silva", nameRu: "Бруно Силва" }
  ];
  const rows = [
    { opponentName: "Dustin Poirier", opponentNameRu: "Дустин Поириер", count: 9 },
    { opponentName: "Poirier Dustin", opponentNameRu: "Поириер Дустин", count: 1 },
    { opponentName: "Tyron Woodley", opponentNameRu: "Тирон Уоодлеи", count: 12 },
    { opponentName: "Tyron Woodley", opponentNameRu: "Тайрон Вудли", count: 2 },
    { opponentName: "Bruno Silva", opponentNameRu: "Бруно Силва", count: 3 },
    { opponentName: "Silva", opponentNameRu: "Силва", count: 22 }
  ];
  assert.deepEqual(collectUnmatchedOpponents(fighters, rows), [
    { name: "Tyron Woodley", rows: 14, current: "Тирон Уоодлеи" },
    { name: "Bruno Silva", rows: 3, current: "Бруно Силва" }
  ]);
});

test("a model answer is taken only for asked names and only in clean Cyrillic", () => {
  const names = ["Tyron Woodley", "Jose Aldo", "Rick Story", "Gian Villante"];
  const parsed = {
    "Tyron Woodley": "Тайрон Вудли",
    "Jose Aldo": "Жозе Альдо, бывший чемпион UFC в полулёгком весе",
    "Rick Story": "Rick Story",
    "Someone Else": "Кто-то Ещё"
  };
  assert.deepEqual(pickValidNames(parsed, names), { "Tyron Woodley": "Тайрон Вудли" });
  assert.deepEqual(pickValidNames(null, names), {});
});

test("askModel retries a broken answer and returns the valid names", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    const content = calls === 1 ? "не JSON" : '```json\n{"Tyron Woodley": "Тайрон Вудли"}\n```';
    return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
  };
  const realSetTimeout = globalThis.setTimeout;
  (globalThis as any).setTimeout = (fn: () => void) => realSetTimeout(fn, 0);
  try {
    const result = await askModel(["Tyron Woodley"], { baseUrl: "https://example.test", apiKey: "k", model: "m" }, fetchImpl);
    assert.deepEqual(result, { "Tyron Woodley": "Тайрон Вудли" });
    assert.equal(calls, 2);
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
});
