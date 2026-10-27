import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTelegramPicksPost,
  decideTelegramPicksAction,
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
