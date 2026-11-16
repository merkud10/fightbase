import test from "node:test";
import assert from "node:assert/strict";

import { barHeightPercent, compactEventLabel, shortEventLabel, tabEventLabel } from "../lib/prediction-chart";

const prochazka = { a: { slug: "jiri-prochazka", name: "Иржи Прохазка" }, b: { slug: "navajo-stirling", name: "Навахо Стирлинг" } };
const oliveira = { a: { slug: "charles-oliveira", name: "Чарльз Оливейра" }, b: { slug: "diego-lopes", name: "Диего Лопес" } };

test("chart label keeps only what tells events apart", () => {
  assert.equal(shortEventLabel("UFC 334: Gane vs. Hokit"), "UFC 334");
  assert.equal(shortEventLabel("UFC Fight Night: Cortes Acosta vs. Walker"), "Cortes Acosta — Walker");
  assert.equal(shortEventLabel("UFC Fight Night: Adesanya vs Magomedov"), "Adesanya — Magomedov");
  assert.equal(shortEventLabel("Dana White's Contender Series: Season 10, Week 10"), "Season 10, Week 10");
  assert.equal(shortEventLabel("UFC Fight Night"), "UFC Fight Night");
});

test("compact label fits under a narrow bar", () => {
  assert.equal(compactEventLabel("UFC 334: Gane vs. Hokit"), "UFC 334");
  assert.equal(compactEventLabel("UFC Fight Night: Moicano vs. Nolan"), "Moicano");
  assert.equal(compactEventLabel("UFC Fight Night: Cortes Acosta vs. Walker"), "Cortes Acosta");
  assert.equal(compactEventLabel("Dana White's Contender Series: Season 10, Week 10"), "Season 10, Week 10");
});

test("tab label names the main fight in Russian when it is known", () => {
  assert.equal(tabEventLabel("UFC Fight Night: Procházka vs. Stirling", prochazka, "ru"), "Прохазка — Стирлинг");
  assert.equal(tabEventLabel("UFC 335: Oliveira vs. Lopes", oliveira, "ru"), "UFC 335: Оливейра — Лопес");
  assert.equal(tabEventLabel("UFC 335: Oliveira vs. Lopes", null, "ru"), "UFC 335");
  assert.equal(tabEventLabel("UFC Fight Night: Procházka vs. Stirling", null, "ru"), "Procházka — Stirling");
  assert.equal(tabEventLabel("UFC Fight Night: Procházka vs. Stirling", prochazka, "en"), "Procházka — Stirling");
});

test("bar height is the share of called bouts, with a visible minimum", () => {
  assert.equal(barHeightPercent({ correct: 10, judged: 12 }), 83);
  assert.equal(barHeightPercent({ correct: 0, judged: 5 }), 2);
  assert.equal(barHeightPercent({ correct: 0, judged: 0 }), null);
});
