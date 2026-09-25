import test from "node:test";
import assert from "node:assert/strict";

import { buildEventSeoName, isRealMainEvent, surname } from "../lib/event-seo";

const real = { a: { slug: "ciryl-gane", name: "Сирил Ган" }, b: { slug: "josh-hokit", name: "Джош Хокит" } };
const tba = { a: { slug: "opponent-tba", name: "Opponent TBA" }, b: { slug: "tba", name: "TBA" } };

test("surname берёт последнее слово имени", () => {
  assert.equal(surname("Хосе Мигель Дельгадо"), "Дельгадо");
  assert.equal(surname("  Ган "), "Ган");
});

test("isRealMainEvent отсекает заглушки TBA, но не фамилии с «tba» внутри", () => {
  assert.equal(isRealMainEvent(real), true);
  assert.equal(isRealMainEvent(tba), false);
  assert.equal(isRealMainEvent({ a: real.a, b: { slug: "batbayar-tba", name: "TBA" } }), false);
  assert.equal(isRealMainEvent({ a: real.a, b: { slug: "batgerel-batbayar", name: "Батгэрэл Батбаяр" } }), true);
  assert.equal(isRealMainEvent(null), false);
});

test("номерной турнир получает «ЮФС N» и фамилии главного боя", () => {
  assert.equal(buildEventSeoName("UFC 334: Gane vs. Hokit", real), "UFC 334 (ЮФС 334) Ган — Хокит");
  assert.equal(buildEventSeoName("UFC 335", tba), "UFC 335 (ЮФС 335)");
  assert.equal(buildEventSeoName("UFC 335", null), "UFC 335 (ЮФС 335)");
});

test("именной турнир меняет английские фамилии на русские", () => {
  const main = { a: { slug: "renato-moicano", name: "Ренато Мойкано" }, b: { slug: "tom-nolan", name: "Том Нолан" } };
  assert.equal(buildEventSeoName("UFC Fight Night: Moicano vs. Nolan", main), "UFC Fight Night: Мойкано — Нолан");
  assert.equal(buildEventSeoName("Noche UFC: Silva vs. Delgado", main), "Noche UFC: Мойкано — Нолан");
});

test("без главного боя или без «vs» в названии имя не трогаем", () => {
  assert.equal(buildEventSeoName("UFC Fight Night: Moicano vs. Nolan", tba), "UFC Fight Night: Moicano vs. Nolan");
  assert.equal(buildEventSeoName("Dana White's Contender Series: Season 10, Week 7", real), "Dana White's Contender Series: Season 10, Week 7");
  assert.equal(buildEventSeoName("UFC Fight Night Paris", real), "UFC Fight Night Paris");
});
