import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Компоненты собираются для Next с автоматическим JSX; под tsx в тестах им нужен
// React в глобальной области, поэтому компонент подключаем после его установки.
(globalThis as { React?: typeof React }).React = React;

const load = () => import("../components/fighter-next-fight");

const emptyStats = {
  sigStrikesLandedPerMin: null, strikeAccuracy: null, sigStrikesAbsorbedPerMin: null, strikeDefense: null,
  takedownAveragePer15: null, takedownAccuracy: null, takedownDefense: null, submissionAveragePer15: null,
  winsByKnockout: null, winsBySubmission: null, winsByDecision: null, averageFightTime: null
};

test("next fight block names the opponent and leads to the prediction and the card", async () => {
  const { FighterNextFight } = await load();
  const html = renderToStaticMarkup(
    React.createElement(FighterNextFight, {
      locale: "ru",
      opponent: { name: "Исраэль Адесанья", slug: "israel-adesanya", record: "24-6-0" },
      dateLabel: "5 декабря 2026 г.",
      event: { name: "UFC Fight Night: Adesanya vs Magomedov", slug: "ufc-fn-adesanya" },
      predictionPath: "/predictions/ufc-fn-adesanya/israel-adesanya-vs-shara-magomedov"
    })
  );
  assert.match(html, /Следующий бой/);
  assert.match(html, /href="\/ru\/fighters\/israel-adesanya"[^>]*>Исраэль Адесанья</);
  assert.match(html, /24-6-0/);
  assert.match(html, /class="action-link"[^>]*href="\/ru\/predictions\/ufc-fn-adesanya\/israel-adesanya-vs-shara-magomedov"|href="\/ru\/predictions\/ufc-fn-adesanya\/israel-adesanya-vs-shara-magomedov"[^>]*class="action-link"/);
  assert.match(html, /href="\/ru\/events\/ufc-fn-adesanya"/);
});

test("without a prediction page the card link becomes the main action", async () => {
  const { FighterNextFight } = await load();
  const html = renderToStaticMarkup(
    React.createElement(FighterNextFight, {
      locale: "ru",
      opponent: { name: "Соперник", slug: "opponent", record: null },
      dateLabel: "13 декабря 2026 г.",
      event: { name: "UFC 335", slug: "ufc-335" },
      predictionPath: null
    })
  );
  assert.equal(html.includes("/predictions/"), false);
  assert.equal((html.match(/action-link/g) ?? []).length, 1);
  assert.match(html, /Весь кард и время по Москве/);
});

test("a fighter without a booked fight gets his division ranking, predictions and the schedule", async () => {
  const { FighterWhereNext } = await load();
  const html = renderToStaticMarkup(React.createElement(FighterWhereNext, { locale: "ru", weightClass: "Light Heavyweight" }));
  assert.match(html, /href="\/ru\/rankings\/light-heavyweight"[^>]*>Рейтинг UFC в полутяжелом весе</);
  assert.match(html, /href="\/ru\/predictions"/);
  assert.match(html, /href="\/ru\/events"/);
  // Неизвестный вес — без ссылки на рейтинг, остальное на месте.
  const unknown = renderToStaticMarkup(React.createElement(FighterWhereNext, { locale: "ru", weightClass: "" }));
  assert.equal(unknown.includes("/rankings/"), false);
  assert.match(unknown, /href="\/ru\/events"/);
});

test("stat rows keep only known values, so a newcomer gets no wall of dashes", async () => {
  const { buildFighterStatRows } = await load();
  assert.deepEqual(buildFighterStatRows(emptyStats, "ru"), []);
  assert.deepEqual(buildFighterStatRows({ ...emptyStats, winsByKnockout: 7 }, "ru"), [{ label: "Побед KO/TKO", value: 7 }]);
  const rows = buildFighterStatRows({ ...emptyStats, strikeAccuracy: 63, takedownAveragePer15: 0, averageFightTime: "13:43" }, "ru");
  assert.deepEqual(rows, [
    { label: "Точность ударов", value: "63%" },
    { label: "Тейкдауны / 15 мин", value: 0 },
    { label: "Среднее время боя", value: "13:43" }
  ]);
});
