import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { PredictionStatsData } from "../components/prediction-stats-panel";

// Компоненты собираются для Next с автоматическим JSX; под tsx в тестах им нужен
// React в глобальной области, поэтому компонент подключаем после его установки.
(globalThis as { React?: typeof React }).React = React;

const tally = (correct: number, judged: number) => ({ correct, judged, percent: judged > 0 ? Math.round((correct / judged) * 100) : null });

// Цифры прода на 16.11.2026: пять последних турниров, 48 из 65.
const prod: PredictionStatsData = {
  eventsCount: 5,
  events: [
    { slug: "buckley-malott", name: "UFC Fight Night: Buckley vs. Malott", date: new Date("2026-10-18T00:00:00Z"), model: tally(8, 13), favorite: tally(7, 13) },
    { slug: "ufc-333", name: "UFC 333: Volkanovski vs. Evloev", date: new Date("2026-10-24T00:00:00Z"), model: tally(11, 14), favorite: tally(10, 13) },
    { slug: "moicano-nolan", name: "UFC Fight Night: Moicano vs. Nolan", date: new Date("2026-11-01T00:00:00Z"), model: tally(10, 12), favorite: tally(9, 12) },
    { slug: "cortes-walker", name: "UFC Fight Night: Cortes Acosta vs. Walker", date: new Date("2026-11-08T00:00:00Z"), model: tally(9, 14), favorite: tally(9, 14) },
    { slug: "ufc-334", name: "UFC 334: Gane vs. Hokit", date: new Date("2026-11-15T00:00:00Z"), model: tally(10, 12), favorite: tally(9, 12) }
  ],
  model: tally(48, 65),
  favorite: tally(44, 64),
  modelRoi: { units: 4.58, staked: 60, percent: 8 },
  favoriteRoi: { percent: 1 }
};

const render = async (data: PredictionStatsData, sinceNote?: string) => {
  const { PredictionStatsPanel } = await import("../components/prediction-stats-panel");
  return renderToStaticMarkup(React.createElement(PredictionStatsPanel, { locale: "ru", accuracy: data, sinceNote }));
};

test("the panel shows the headline number, both strategies and five events", async () => {
  const html = await render(prod, "Статистика ведётся с 30 сентября 2026 года.");

  assert.match(html, /<strong>74%<\/strong>/);
  assert.match(html, /48 из 65 боёв угадано/);
  assert.match(html, /Фаворит по линии<\/span><b>69%<\/b>/);
  assert.equal(html.match(/class="pstats-group"/g)?.length, 5);
  assert.match(html, /height:83%[^>]*><em>10\/12<\/em>/);
  assert.match(html, /<b>UFC 334<\/b>15\.11/);
  assert.match(html, /<b>Cortes Acosta — Walker<\/b>08\.11/);
  assert.match(html, /class="is-up">\+4,58<\/strong>/);
  assert.match(html, /Модель, ROI<\/dt><dd>\+8%<\/dd>/);
  assert.match(html, /Статистика ведётся с 30 сентября 2026 года\. Прогноз — не совет делать ставки\./);
  assert.match(html, /href="\/ru\/predictions\/accuracy"/);
});

test("a losing bankroll is shown without the green accent", async () => {
  const html = await render({ ...prod, modelRoi: { units: -2.07, staked: 11, percent: -19 }, favoriteRoi: { percent: null } });

  assert.match(html, /<strong>−2,07<\/strong>/);
  assert.match(html, /<dd>-19%<\/dd>/);
  assert.equal(html.includes("Всегда фаворит"), false);
});

test("one event is not a chart, and no judged picks means no panel", async () => {
  const single = await render({ ...prod, eventsCount: 1, events: prod.events.slice(-1) });
  assert.equal(single.includes("pstats-chart"), false);
  assert.match(single, /<strong>74%<\/strong>/);

  assert.equal(await render({ ...prod, model: tally(0, 0) }), "");
});
