import test from "node:test";
import assert from "node:assert/strict";

import { buildModelSummary, type ModelSummaryAccuracy } from "../lib/model-summary";
import type { TelegramPicksEvent, TelegramPicksFight } from "../lib/telegram-picks";

function fight(order: number, a: string, b: string, overrides: Partial<TelegramPicksFight> = {}): TelegramPicksFight {
  return {
    id: `f${order}`,
    stage: "main_card",
    boutOrder: order,
    isMainEvent: order === 1,
    createdAt: null,
    status: "completed",
    resultType: "win",
    winnerFighterId: `${a}-id`,
    fighterAId: `${a}-id`,
    fighterBId: `${b}-id`,
    fighterA: { id: `${a}-id`, name: a, nameRu: a },
    fighterB: { id: `${b}-id`, name: b, nameRu: b },
    predictionSnapshot: { aiPickFighterId: `${a}-id`, percentA: 64, percentB: 36, aiWinChanceA: null, oddsAAtPick: null, oddsBAtPick: null },
    ...overrides
  };
}

// UFC 334 в миниатюре: главный бой угадан, ничья не в счёт, один промах,
// один пик против фаворита сыграл.
const ufc334: TelegramPicksEvent = {
  id: "e334",
  slug: "ufc-334-gane-vs-hokit",
  name: "UFC 334: Gane vs. Hokit",
  status: "completed",
  date: new Date("2026-11-15T00:00:00Z"),
  earlyPrelimsAt: null,
  prelimsAt: null,
  mainCardAt: new Date("2026-11-15T02:00:00Z"),
  fights: [
    fight(4, "Эван Элдер", "Самуэл Санчес", {
      predictionSnapshot: { aiPickFighterId: "Эван Элдер-id", percentA: 47, percentB: 53, aiWinChanceA: null, oddsAAtPick: null, oddsBAtPick: null }
    }),
    fight(1, "Сирил Ган", "Джош Хокит"),
    fight(3, "Билал Хасан", "Луис Гуруле", { winnerFighterId: "Луис Гуруле-id" }),
    fight(2, "Урош Медич", "Кевин Холланд", { resultType: "draw", winnerFighterId: null })
  ]
};

const tally = (correct: number, judged: number) => ({ correct, judged });
const accuracy: ModelSummaryAccuracy = {
  eventsCount: 2,
  events: [
    { slug: "ufc-fight-night-cortes-acosta-vs-walker", name: "UFC Fight Night: Cortes Acosta vs. Walker", date: new Date("2026-11-08T00:00:00Z"), model: tally(9, 14), favorite: tally(9, 14) },
    { slug: "ufc-334-gane-vs-hokit", name: "UFC 334: Gane vs. Hokit", date: new Date("2026-11-15T00:00:00Z"), model: tally(10, 12), favorite: tally(9, 12) }
  ],
  model: { correct: 19, judged: 26, percent: 73 },
  modelRoi: { units: 0.87, staked: 24, percent: 4 }
};

test("summary counts the event the same way the site does", () => {
  const summary = buildModelSummary(ufc334, accuracy);

  assert.equal(summary.title, "UFC 334: Ган — Хокит");
  assert.equal(summary.dateLabel, "15 ноября 2026");
  assert.deepEqual(summary.model, { correct: 2, judged: 3 });
  assert.deepEqual(summary.favorite, { correct: 1, judged: 3 });
  // От главного боя к первому: угадан, ничья, промах, угадан.
  assert.deepEqual(summary.marks, ["hit", "void", "miss", "hit"]);
});

test("chart marks the current event and totals carry the bankroll", () => {
  const summary = buildModelSummary(ufc334, accuracy);

  assert.deepEqual(
    summary.chart.map((item) => [item.label, item.dateLabel, item.current, item.modelHeight, item.favoriteHeight]),
    [
      ["Cortes Acosta", "08.11", false, 64, 64],
      ["UFC 334", "15.11", true, 83, 75]
    ]
  );
  assert.deepEqual(summary.totals, { eventsCount: 2, percent: 73, correct: 19, judged: 26, bankroll: "+0,87", bankrollUp: true });
});

test("a losing or unknown bankroll and a fight night title", () => {
  const fightNight = { ...ufc334, name: "UFC Fight Night: Procházka vs. Stirling", fights: [fight(1, "Иржи Прохазка", "Навахо Стирлинг")] };
  const losing = buildModelSummary(fightNight, { ...accuracy, modelRoi: { units: -2.07, staked: 11, percent: -19 } });
  assert.equal(losing.title, "UFC Fight Night: Прохазка — Стирлинг");
  assert.equal(losing.totals.bankroll, "−2,07");
  assert.equal(losing.totals.bankrollUp, false);

  const unknown = buildModelSummary(ufc334, { ...accuracy, modelRoi: { units: 0, staked: 0, percent: null } });
  assert.equal(unknown.totals.bankroll, null);
});
