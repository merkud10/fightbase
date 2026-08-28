import assert from "node:assert/strict";
import test from "node:test";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parseUfcRecentFights } = require("../scripts/sync-ufc-roster.js");

// Сокращённая, но структурно точная разметка карточки с ufc.com/athlete/*:
// исход каждого бойца лежит в классе его блока с фотографией, а плашка «Win»
// на карточке одна и принадлежит победителю.
function athleteCard({
  redSlug,
  redOutcome,
  blueSlug,
  blueOutcome,
  redName,
  blueName,
  eventSlug,
  date
}: {
  redSlug: string;
  redOutcome: string;
  blueSlug: string;
  blueOutcome: string;
  redName: string;
  blueName: string;
  eventSlug: string;
  date: string;
}) {
  const plaque = '<div class="c-card-event--athlete-results__plaque win"> Win </div>';

  return `
<article class="c-card-event--athlete-results">
  <div class="c-card-event--athlete-results__fight-container">
    <div class="c-card-event--athlete-results__image c-card-event--athlete-results__red-image ${redOutcome}">
      ${redOutcome === "win" ? plaque : ""}
      <a href="https://www.ufc.com/athlete/${redSlug}"><div><img src="x.png"></div></a>
    </div>
    <div class="c-card-event--athlete-results__image c-card-event--athlete-results__blue-image ${blueOutcome}">
      ${blueOutcome === "win" ? plaque : ""}
      <a href="https://www.ufc.com/athlete/${blueSlug}"><div><img src="y.png"></div></a>
    </div>
    <div class="c-card-event--athlete-results__headline">
      <a href="https://www.ufc.com/athlete/${redSlug}">${redName}</a> vs
      <a href="https://www.ufc.com/athlete/${blueSlug}">${blueName}</a>
    </div>
  </div>
  <div class="c-card-event--athlete-results__date">${date}</div>
  <a href="https://www.ufc.com/event/${eventSlug}">event</a>
  <div class="c-card-event--athlete-results__result-label">Method</div>
  <div class="c-card-event--athlete-results__result-text">KO/TKO</div>
  <div class="c-card-event--athlete-results__result-label">Round</div>
  <div class="c-card-event--athlete-results__result-text">2</div>
  <div class="c-card-event--athlete-results__result-label">Time</div>
  <div class="c-card-event--athlete-results__result-text">4:05</div>
</article>`;
}

function wrap(cards: string) {
  return `<div id="athlete-record">${cards}</div>`;
}

test("поражение не превращается в победу по чужой плашке", () => {
  const html = wrap(
    athleteCard({
      redSlug: "navajo-stirling",
      redOutcome: "win",
      blueSlug: "bruno-lopes",
      blueOutcome: "loss",
      redName: "Stirling",
      blueName: "Lopes",
      eventSlug: "ufc-fight-night-march-28-2026",
      date: "Mar. 28, 2026"
    })
  );

  const fights = parseUfcRecentFights(html, "bruno-lopes", "Bruno Lopes", "Light Heavyweight");

  assert.equal(fights.length, 1);
  assert.equal(fights[0].result, "Поражение");
});

test("победа того же боя читается со стороны победителя", () => {
  const html = wrap(
    athleteCard({
      redSlug: "navajo-stirling",
      redOutcome: "win",
      blueSlug: "bruno-lopes",
      blueOutcome: "loss",
      redName: "Stirling",
      blueName: "Lopes",
      eventSlug: "ufc-fight-night-march-28-2026",
      date: "Mar. 28, 2026"
    })
  );

  const fights = parseUfcRecentFights(html, "navajo-stirling", "Navajo Stirling", "Light Heavyweight");

  assert.equal(fights.length, 1);
  assert.equal(fights[0].result, "Победа");
});

test("карточка и Q&A-абзац об одном бое схлопываются в одну строку", () => {
  const card = athleteCard({
    redSlug: "navajo-stirling",
    redOutcome: "win",
    blueSlug: "bruno-lopes",
    blueOutcome: "loss",
    redName: "Stirling",
    blueName: "Lopes",
    eventSlug: "ufc-fight-night-march-28-2026",
    date: "Mar. 28, 2026"
  });

  // Второй парсер берёт название турнира из <strong> — без даты в тексте.
  const qna = `
<div class="field--name-qna-ufc">
  <div class="field__item">
    <p><strong>UFC Fight Night</strong> (3/28/26) Lopes was stopped by Navajo Stirling via strikes at 4:05 of the second round</p>
  </div>
</div>`;

  const fights = parseUfcRecentFights(wrap(card) + qna, "bruno-lopes", "Bruno Lopes", "Light Heavyweight");

  assert.equal(fights.length, 1, "разные названия одного турнира не должны давать две строки");
  assert.equal(fights[0].result, "Поражение");
});

test("ничья и no contest не читаются как победа", () => {
  const draw = parseUfcRecentFights(
    wrap(
      athleteCard({
        redSlug: "fighter-a",
        redOutcome: "draw",
        blueSlug: "fighter-b",
        blueOutcome: "draw",
        redName: "A",
        blueName: "B",
        eventSlug: "ufc-fight-night-june-1-2025",
        date: "Jun. 1, 2025"
      })
    ),
    "fighter-a",
    "Fighter A",
    "Lightweight"
  );

  assert.equal(draw[0].result, "Ничья");
});
