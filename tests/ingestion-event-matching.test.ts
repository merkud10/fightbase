import assert from "node:assert/strict";
import test from "node:test";

import { matchEventByNumberedCode } from "../lib/ingestion";
import { normalizeComparableText } from "../lib/pipeline";

const EVENTS = [
  { name: "UFC 330: Makhachev vs. Machado Garry" },
  { name: "UFC 331: Someone vs. Other" },
  { name: "UFC Fight Night: Hernandez vs. Rodrigues" },
  { name: "Dana White's Contender Series Season 10 Week 2" }
];

function match(text: string) {
  return matchEventByNumberedCode(EVENTS, normalizeComparableText(text));
}

test("matches a numbered event mentioned in Russian text", () => {
  const found = match("Ислам Махачев победил Иэна Гэрри на UFC 330 единогласным решением судей.");
  assert.equal(found?.name, "UFC 330: Makhachev vs. Machado Garry");
});

test("does not match a shorter number inside a longer one", () => {
  const events = [{ name: "UFC 33: Victory in Vegas" }];
  const found = matchEventByNumberedCode(events, normalizeComparableText("Итоги турнира UFC 330 в Филадельфии"));
  assert.equal(found, null);
});

test("matches UFC-330 spelled with a hyphen", () => {
  const found = match("Бонусы турнира UFC-330 получили четыре бойца");
  assert.equal(found?.name, "UFC 330: Makhachev vs. Machado Garry");
});

test("returns null when two different numbered events are mentioned", () => {
  const found = match("После UFC 330 внимание переключается на UFC 331 и его главный бой.");
  assert.equal(found, null);
});

test("returns null when no numbered code appears in the text", () => {
  const found = match("Эрнандес и Родригес возглавят ближайший Fight Night в Лас-Вегасе.");
  assert.equal(found, null);
});

test("ignores events without a numbered code", () => {
  const events = [{ name: "UFC Fight Night: Hernandez vs. Rodrigues" }];
  const found = matchEventByNumberedCode(events, normalizeComparableText("Отчёт с UFC 330"));
  assert.equal(found, null);
});
