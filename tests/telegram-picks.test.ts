import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTelegramPicksPost,
  buildTelegramResultsPost,
  decideTelegramPicksAction,
  decideTelegramResultsAction,
  resolveEventStart,
  TELEGRAM_TEXT_MAX,
  type TelegramPicksEvent,
  type TelegramPicksFight
} from "../lib/telegram-picks";

const HOUR = 3_600_000;
const MAIN_CARD_AT = new Date("2026-11-15T03:00:00Z"); // 06:00 мск, ночь на воскресенье

function fight(id: string, overrides: Partial<TelegramPicksFight> = {}): TelegramPicksFight {
  return {
    id,
    stage: "main_card",
    boutOrder: null,
    isMainEvent: false,
    createdAt: null,
    status: "scheduled",
    resultType: null,
    winnerFighterId: null,
    fighterAId: `${id}-a`,
    fighterBId: `${id}-b`,
    fighterA: { id: `${id}-a`, name: `${id} Alpha`, nameRu: `${id} Альфа` },
    fighterB: { id: `${id}-b`, name: `${id} Beta`, nameRu: `${id} Бета` },
    predictionSnapshot: {
      aiPickFighterId: `${id}-a`,
      percentA: 64,
      percentB: 36,
      aiWinChanceA: null,
      oddsAAtPick: null,
      oddsBAtPick: null
    },
    ...overrides
  };
}

function event(fights: TelegramPicksFight[], overrides: Partial<TelegramPicksEvent> = {}): TelegramPicksEvent {
  return {
    id: "e1",
    slug: "ufc-334",
    name: "UFC 334: Gane vs. Hokit",
    status: "upcoming",
    date: new Date("2026-11-14T00:00:00Z"),
    earlyPrelimsAt: null,
    prelimsAt: new Date("2026-11-15T01:00:00Z"),
    mainCardAt: MAIN_CARD_AT,
    fights,
    ...overrides
  };
}

const noPick = { aiPickFighterId: null, percentA: 50, percentB: 50, aiWinChanceA: null, oddsAAtPick: null, oddsBAtPick: null };

test("resolveEventStart takes the earliest known card segment", () => {
  assert.equal(resolveEventStart(event([])).toISOString(), "2026-11-15T01:00:00.000Z");
  assert.equal(
    resolveEventStart(event([], { prelimsAt: null, mainCardAt: null })).toISOString(),
    "2026-11-14T00:00:00.000Z"
  );
});

test("decideTelegramPicksAction waits outside the 72-hour window even with every pick ready", () => {
  const start = resolveEventStart(event([]));
  const now = new Date(start.getTime() - 73 * HOUR);
  assert.equal(decideTelegramPicksAction({ event: event([fight("f1")]), hasPost: false, now }), "wait");
});

test("decideTelegramPicksAction posts inside 72 hours once every scheduled fight has a pick", () => {
  const start = resolveEventStart(event([]));
  const now = new Date(start.getTime() - 60 * HOUR);
  const completed = fight("f3", { status: "completed", predictionSnapshot: null });
  assert.equal(
    decideTelegramPicksAction({ event: event([fight("f1"), fight("f2"), completed]), hasPost: false, now }),
    "post"
  );
});

test("decideTelegramPicksAction waits for missing picks until 36 hours before the start", () => {
  const start = resolveEventStart(event([]));
  const partial = event([fight("f1"), fight("f2", { predictionSnapshot: noPick })]);
  assert.equal(decideTelegramPicksAction({ event: partial, hasPost: false, now: new Date(start.getTime() - 40 * HOUR) }), "wait");
  assert.equal(decideTelegramPicksAction({ event: partial, hasPost: false, now: new Date(start.getTime() - 30 * HOUR) }), "post");
});

test("decideTelegramPicksAction never posts a card without a single pick", () => {
  const start = resolveEventStart(event([]));
  const empty = event([fight("f1", { predictionSnapshot: null })]);
  assert.equal(decideTelegramPicksAction({ event: empty, hasPost: false, now: new Date(start.getTime() - 2 * HOUR) }), "wait");
});

test("decideTelegramPicksAction edits an existing post until the start and closes after it", () => {
  const start = resolveEventStart(event([]));
  assert.equal(decideTelegramPicksAction({ event: event([fight("f1")]), hasPost: true, now: new Date(start.getTime() - HOUR) }), "edit");
  assert.equal(decideTelegramPicksAction({ event: event([fight("f1")]), hasPost: true, now: start }), "closed");
  assert.equal(decideTelegramPicksAction({ event: event([fight("f1")]), hasPost: false, now: start }), "closed");
});

test("buildTelegramPicksPost lists the card in order with groups, picks and the event link", () => {
  const text = buildTelegramPicksPost(
    event([
      fight("prelim", { stage: "prelims", boutOrder: 1 }),
      fight("co", { boutOrder: 2 }),
      fight("main", { isMainEvent: true, boutOrder: 1, predictionSnapshot: { ...noPick, aiPickFighterId: "main-b", percentA: 28, percentB: 72 } }),
      fight("late", { stage: "early_prelims", predictionSnapshot: noPick }),
      fight("done", { status: "completed" })
    ]),
    "https://fightbase.ru/"
  );

  assert.equal(
    text,
    [
      "🥊 Пики ИИ-модели FightBase: UFC 334: Gane vs. Hokit",
      "В ночь на воскресенье, 15 ноября · основной кард в 06:00 мск",
      "",
      "Основной кард",
      "• main Альфа — main Бета → main Бета, 72%",
      "• co Альфа — co Бета → co Альфа, 64%",
      "",
      "Прелимы",
      "• prelim Альфа — prelim Бета → prelim Альфа, 64%",
      "• late Альфа — late Бета → пик позже",
      "",
      "Все разборы: https://fightbase.ru/ru/events/ufc-334"
    ].join("\n")
  );
});

test("buildTelegramPicksPost adds value picks and falls back to the plain date", () => {
  const valued = fight("f1", {
    predictionSnapshot: { aiPickFighterId: "f1-a", percentA: 55, percentB: 45, aiWinChanceA: 40, oddsAAtPick: 1.5, oddsBAtPick: 2.4 }
  });
  const text = buildTelegramPicksPost(event([valued], { mainCardAt: null }), "https://fightbase.ru");
  assert.match(text, /^🥊 Пики ИИ-модели FightBase: UFC 334: Gane vs\. Hokit\n14 ноября\n/);
  assert.match(text, /\n\n💎 Ценный выбор: f1 Бета \(кэф 2,40\)\n\nВсе разборы:/);
});

test("buildTelegramPicksPost stays within the Telegram message limit", () => {
  const longName = "Я".repeat(300);
  const fights = Array.from({ length: 14 }, (_, index) =>
    fight(`f${index}`, {
      fighterA: { id: `f${index}-a`, name: "A", nameRu: longName },
      predictionSnapshot: { aiPickFighterId: `f${index}-a`, percentA: 55, percentB: 45, aiWinChanceA: 40, oddsAAtPick: 1.5, oddsBAtPick: 2.4 }
    })
  );
  const text = buildTelegramPicksPost(event(fights), "https://fightbase.ru");
  assert.ok(text.length <= TELEGRAM_TEXT_MAX);
  assert.ok(!text.includes("💎"));
});

function settled(id: string, overrides: Partial<TelegramPicksFight> = {}): TelegramPicksFight {
  return fight(id, { status: "completed", resultType: "win", winnerFighterId: `${id}-a`, ...overrides });
}

const accuracy = { eventsCount: 5, model: { correct: 43, judged: 78, percent: 55 }, favorite: { percent: 65 } };

test("decideTelegramResultsAction waits for the event to complete and for every picked fight", () => {
  const start = resolveEventStart(event([]));
  const at = (hours: number) => new Date(start.getTime() + hours * HOUR);
  const open = settled("f2", { status: "scheduled", resultType: null, winnerFighterId: null });

  assert.equal(decideTelegramResultsAction({ event: event([settled("f1")]), hasResultsPost: false, now: at(5) }), "wait");
  assert.equal(
    decideTelegramResultsAction({ event: event([settled("f1")], { status: "completed" }), hasResultsPost: false, now: at(5) }),
    "post"
  );
  assert.equal(
    decideTelegramResultsAction({ event: event([settled("f1"), open], { status: "completed" }), hasResultsPost: false, now: at(10) }),
    "wait"
  );
  assert.equal(
    decideTelegramResultsAction({ event: event([settled("f1"), open], { status: "completed" }), hasResultsPost: false, now: at(18) }),
    "post"
  );
});

test("decideTelegramResultsAction posts once and never for a stale event", () => {
  const start = resolveEventStart(event([]));
  const done = event([settled("f1")], { status: "completed" });
  assert.equal(decideTelegramResultsAction({ event: done, hasResultsPost: true, now: new Date(start.getTime() + 5 * HOUR) }), "skip");
  assert.equal(decideTelegramResultsAction({ event: done, hasResultsPost: false, now: new Date(start.getTime() + 8 * 24 * HOUR) }), "skip");
});

test("buildTelegramResultsPost scores the card against the favorite and the recent events", () => {
  const text = buildTelegramResultsPost(
    event(
      [
        settled("main", { isMainEvent: true }),
        settled("co", { boutOrder: 2, winnerFighterId: "co-b" }),
        settled("upset", { stage: "prelims", boutOrder: 1, winnerFighterId: "upset-b", predictionSnapshot: { ...noPick, aiPickFighterId: "upset-b", percentA: 70, percentB: 30 } }),
        settled("draw", { stage: "prelims", boutOrder: 2, resultType: "draw", winnerFighterId: null }),
        settled("nopick", { stage: "prelims", boutOrder: 3, predictionSnapshot: noPick }),
        fight("cancelled", { stage: "prelims" })
      ],
      { status: "completed" }
    ),
    accuracy,
    "https://fightbase.ru/"
  );

  assert.equal(
    text,
    [
      "📊 Итоги ИИ-модели FightBase: UFC 334: Gane vs. Hokit",
      "Угадала 2 из 3 (67%) · фаворит по предматчевой оценке — 1 из 3",
      "",
      "Основной кард",
      "✅ main Альфа — main Бета · победил main Альфа",
      "❌ co Альфа — co Бета · пик co Альфа, победил co Бета",
      "",
      "Прелимы",
      "✅ upset Альфа — upset Бета · победил upset Бета 🔥 против фаворита",
      "➖ draw Альфа — draw Бета · ничья, в счёт не идёт",
      "▫️ nopick Альфа — nopick Бета · победил nopick Альфа",
      "",
      "За последние 5 турниров: 55% (43 из 78), фаворит — 65%",
      "Результаты и разборы: https://fightbase.ru/ru/events/ufc-334"
    ].join("\n")
  );
});

test("buildTelegramResultsPost reports value picks and handles thin accuracy data", () => {
  const valued = settled("f1", {
    winnerFighterId: "f1-b",
    predictionSnapshot: { aiPickFighterId: "f1-a", percentA: 55, percentB: 45, aiWinChanceA: 40, oddsAAtPick: 1.5, oddsBAtPick: 2.4 }
  });
  const nc = settled("f2", { resultType: "no_contest", winnerFighterId: null });
  const text = buildTelegramResultsPost(
    event([valued, nc], { status: "completed" }),
    { eventsCount: 1, model: { correct: 0, judged: 1, percent: 0 }, favorite: { percent: null } },
    "https://fightbase.ru"
  );
  assert.match(text, /\n➖ f2 Альфа — f2 Бета · NC, в счёт не идёт\n/);
  assert.match(text, /\n\n💎 Ценный выбор: f1 Бета \(кэф 2,40\) — сыграл\n\nЗа последний турнир: 0% \(0 из 1\)\nРезультаты/);

  const empty = buildTelegramResultsPost(
    event([nc], { status: "completed" }),
    { eventsCount: 0, model: { correct: 0, judged: 0, percent: null }, favorite: { percent: null } },
    "https://fightbase.ru"
  );
  assert.match(empty, /^📊 Итоги ИИ-модели FightBase: UFC 334: Gane vs\. Hokit\nПики модели в этом турнире в зачёт не попали\n/);
  assert.ok(!empty.includes("За последн"));
});
