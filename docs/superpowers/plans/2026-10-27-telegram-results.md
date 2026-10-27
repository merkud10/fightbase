# Итоги ИИ-модели после турнира в Telegram — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** утром после турнира публиковать в канал итоги ИИ-модели FightBase ответом на пост с пиками: счёт против фаворита, строки по боям, ценный выбор и счёт за последние турниры.

**Architecture:** чистые функции `decideTelegramResultsAction` и `buildTelegramResultsPost` в `lib/telegram-picks.ts` (общие с постом пиков группировка карда и укладка в лимит), шаг итогов в `lib/telegram-picks-runner.ts` перед шагом пиков, два поля в `TelegramEventPost`. Отдельной задачи cron нет.

**Tech Stack:** Next.js, Prisma, `node --import tsx --test`, Telegram Bot API (`sendMessage` с `reply_parameters`).

Спека: `docs/superpowers/specs/2026-10-27-telegram-results-design.md`. Коммит и пуш — только по просьбе пользователя.

---

### Task 1: Поля итогов в TelegramEventPost

**Files:** `prisma/schema.prisma`, `prisma/schema.postgres.prisma`, `prisma/migrations/20261027150000_add_telegram_results_post/migration.sql`

- [ ] В `model TelegramEventPost` обеих схем после `unpinnedAt DateTime?`:

```prisma
  // Пост с итогами модели после турнира — ответом на пост с пиками.
  resultsMessageId Int?
  resultsPostedAt  DateTime?
```
и `@@index([resultsPostedAt])` после `@@index([unpinnedAt])`.

- [ ] Миграция:

```sql
ALTER TABLE "TelegramEventPost" ADD COLUMN "resultsMessageId" INTEGER;
ALTER TABLE "TelegramEventPost" ADD COLUMN "resultsPostedAt" TIMESTAMP(3);

CREATE INDEX "TelegramEventPost_resultsPostedAt_idx" ON "TelegramEventPost"("resultsPostedAt");
```

- [ ] `npm run prisma:generate:pg` → `Generated Prisma Client`; `npx prisma validate --schema prisma/schema.postgres.prisma` → valid.

### Task 2: Решение и текст итогов (TDD)

**Files:** `lib/telegram-picks.ts`, `tests/telegram-picks.test.ts`

- [ ] В хелпер `event()` теста добавить `status: "upcoming",`, в импорт — `buildTelegramResultsPost`, `decideTelegramResultsAction`. Дописать в конец теста:

```ts
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
```

- [ ] `node --import tsx --test tests/telegram-picks.test.ts` → FAIL (нет экспортов).
- [ ] Полный `lib/telegram-picks.ts` (пост пиков переведён на общие `buildCardBlocks` и `fitTelegramText`, поведение не меняется):

```ts
// Посты ИИ-модели FightBase для Telegram-канала: пики на весь кард до турнира и
// итоги после него — когда их публиковать и что в них писать. Bot API и база —
// в lib/telegram-picks-runner.ts, здесь только чистые функции. Пики и вердикты
// считают те же функции, что сайт, чтобы канал и страницы не расходились.

import { getDisplayName } from "@/lib/display";
import { describeFightPick } from "@/lib/event-picks";
import { formatCardNightLabel, formatCardTime } from "@/lib/event-time";
import { sortFightsForCard, type FightCardSortable } from "@/lib/fight-card";
import { resolveValuePick, resolveValueUnits } from "@/lib/prediction-value";
import { resolveAiPickVerdict, resolvePredictionVerdict } from "@/lib/prediction-verdict";

// Пики части боёв считаются за недели до турнира, поэтому без окна пост ушёл бы
// за месяц. За 36 часов публикуем и неполный кард: остальные пики допишет правка.
export const POST_WINDOW_HOURS = 72;
export const PARTIAL_POST_HOURS = 36;
// Итоги ждут результатов всех боёв с пиком, но не дольше 18 часов от начала:
// надёжного времени завершения турнира в базе нет. Старше недели — не публикуем.
export const RESULTS_FALLBACK_HOURS = 18;
export const RESULTS_STALE_HOURS = 7 * 24;
export const TELEGRAM_TEXT_MAX = 4096;

const HOUR_MS = 3_600_000;

type PicksFighter = { id: string; name: string; nameRu?: string | null };

export type TelegramPicksFight = FightCardSortable & {
  status: string;
  resultType: string | null;
  winnerFighterId: string | null;
  fighterAId: string;
  fighterBId: string;
  fighterA: PicksFighter;
  fighterB: PicksFighter;
  predictionSnapshot: {
    aiPickFighterId: string | null;
    percentA: number;
    percentB: number;
    aiWinChanceA: number | null;
    oddsAAtPick: number | null;
    oddsBAtPick: number | null;
  } | null;
};

export type TelegramPicksEvent = {
  id: string;
  slug: string;
  name: string;
  status: string;
  date: Date;
  earlyPrelimsAt: Date | null;
  prelimsAt: Date | null;
  mainCardAt: Date | null;
  fights: TelegramPicksFight[];
};

export type TelegramPicksAction = "post" | "edit" | "wait" | "closed";
export type TelegramResultsAction = "post" | "wait" | "skip";

// Счёт модели и фаворита за последние турниры — форма ответа getPredictionAccuracy.
export type TelegramResultsAccuracy = {
  eventsCount: number;
  model: { correct: number; judged: number; percent: number | null };
  favorite: { percent: number | null };
};

export function resolveEventStart(event: Pick<TelegramPicksEvent, "date" | "earlyPrelimsAt" | "prelimsAt" | "mainCardAt">) {
  return event.earlyPrelimsAt ?? event.prelimsAt ?? event.mainCardAt ?? event.date;
}

export function decideTelegramPicksAction({
  event,
  hasPost,
  now
}: {
  event: TelegramPicksEvent;
  hasPost: boolean;
  now: Date;
}): TelegramPicksAction {
  const hoursLeft = (resolveEventStart(event).getTime() - now.getTime()) / HOUR_MS;
  if (hoursLeft <= 0) return "closed";
  if (hasPost) return "edit";
  if (hoursLeft > POST_WINDOW_HOURS) return "wait";

  const scheduled = event.fights.filter((fight) => fight.status === "scheduled");
  const picked = scheduled.filter((fight) => describeFightPick(fight)).length;
  if (picked === 0) return "wait";
  return picked === scheduled.length || hoursLeft < PARTIAL_POST_HOURS ? "post" : "wait";
}

export function decideTelegramResultsAction({
  event,
  hasResultsPost,
  now
}: {
  event: TelegramPicksEvent;
  hasResultsPost: boolean;
  now: Date;
}): TelegramResultsAction {
  if (hasResultsPost) return "skip";
  const hoursSinceStart = (now.getTime() - resolveEventStart(event).getTime()) / HOUR_MS;
  if (hoursSinceStart > RESULTS_STALE_HOURS) return "skip";
  if (event.status !== "completed") return "wait";

  const allPicksSettled = event.fights.every(
    (fight) => !fight.predictionSnapshot?.aiPickFighterId || fight.status === "completed"
  );
  return allPicksSettled || hoursSinceStart >= RESULTS_FALLBACK_HOURS ? "post" : "wait";
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatEventDateLine(event: TelegramPicksEvent) {
  if (event.mainCardAt) {
    return `${capitalize(formatCardNightLabel(event.mainCardAt, "ru"))} · основной кард в ${formatCardTime(event.mainCardAt, "ru")} мск`;
  }
  // date — полночь UTC «дня турнира», поэтому форматируем в UTC.
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" }).format(event.date);
}

function fighterNames(fight: TelegramPicksFight) {
  return { nameA: getDisplayName(fight.fighterA, "ru"), nameB: getDisplayName(fight.fighterB, "ru") };
}

// Бои в порядке карда, разложенные на «Основной кард» и «Прелимы»; пустые группы опускаются.
function buildCardBlocks(fights: TelegramPicksFight[], formatLine: (fight: TelegramPicksFight) => string) {
  const sorted = sortFightsForCard(fights);
  const isMainCard = (fight: TelegramPicksFight) => Boolean(fight.isMainEvent) || fight.stage === "main_card";
  const groups: Array<[string, TelegramPicksFight[]]> = [
    ["Основной кард", sorted.filter(isMainCard)],
    ["Прелимы", sorted.filter((fight) => !isMainCard(fight))]
  ];
  return groups
    .filter(([, list]) => list.length > 0)
    .map(([title, list]) => [title, ...list.map(formatLine)].join("\n"));
}

// Укладывает пост в лимит Telegram: сначала убирает строки ценного выбора с конца,
// потом обрезает текст.
function fitTelegramText(compose: (valueLines: string[]) => string, valueLines: string[]) {
  let lines = valueLines;
  let text = compose(lines);
  while (text.length > TELEGRAM_TEXT_MAX && lines.length > 0) {
    lines = lines.slice(0, -1);
    text = compose(lines);
  }
  return text.length > TELEGRAM_TEXT_MAX ? `${text.slice(0, TELEGRAM_TEXT_MAX - 1).trimEnd()}…` : text;
}

function resolveFightValuePick(fight: TelegramPicksFight) {
  const snapshot = fight.predictionSnapshot;
  if (!snapshot) return null;
  return resolveValuePick({
    aiWinChanceA: snapshot.aiWinChanceA,
    oddsAAtPick: snapshot.oddsAAtPick,
    oddsBAtPick: snapshot.oddsBAtPick,
    fighterAId: fight.fighterAId,
    fighterBId: fight.fighterBId
  });
}

function formatValuePickLabel(fight: TelegramPicksFight, valuePick: NonNullable<ReturnType<typeof resolveFightValuePick>>) {
  const name = getDisplayName(valuePick.side === "A" ? fight.fighterA : fight.fighterB, "ru");
  return `💎 Ценный выбор: ${name} (кэф ${valuePick.odds.toFixed(2).replace(".", ",")})`;
}

function formatPickLine(fight: TelegramPicksFight) {
  const { nameA, nameB } = fighterNames(fight);
  const pick = describeFightPick(fight);
  const verdict = pick ? `${pick.side === "A" ? nameA : nameB}, ${pick.percent}%` : "пик позже";
  return `• ${nameA} — ${nameB} → ${verdict}`;
}

export function buildTelegramPicksPost(event: TelegramPicksEvent, siteUrl: string) {
  const fights = event.fights.filter((fight) => fight.status === "scheduled");
  const head = `🥊 Пики ИИ-модели FightBase: ${event.name}\n${formatEventDateLine(event)}`;
  const cardBlocks = buildCardBlocks(fights, formatPickLine);
  const link = `Все разборы: ${siteUrl.replace(/\/$/, "")}/ru/events/${event.slug}`;
  const valueLines = sortFightsForCard(fights).flatMap((fight) => {
    const valuePick = resolveFightValuePick(fight);
    return valuePick ? [formatValuePickLabel(fight, valuePick)] : [];
  });

  return fitTelegramText(
    (lines) => [head, ...cardBlocks, ...(lines.length > 0 ? [lines.join("\n")] : []), link].join("\n\n"),
    valueLines
  );
}

// Фаворит по предматчевой оценке (percentA/percentB), как в getPredictionAccuracy.
function favoriteFighterId(fight: TelegramPicksFight) {
  const snapshot = fight.predictionSnapshot;
  if (!snapshot || snapshot.percentA === snapshot.percentB) return null;
  return snapshot.percentA > snapshot.percentB ? fight.fighterAId : fight.fighterBId;
}

function formatResultLine(fight: TelegramPicksFight) {
  const { nameA, nameB } = fighterNames(fight);
  const pair = `${nameA} — ${nameB}`;
  if (fight.resultType === "draw") return `➖ ${pair} · ничья, в счёт не идёт`;
  if (fight.resultType !== "win" || !fight.winnerFighterId) return `➖ ${pair} · NC, в счёт не идёт`;

  const winner = fight.winnerFighterId === fight.fighterAId ? nameA : nameB;
  const pickId = fight.predictionSnapshot?.aiPickFighterId;
  if (!pickId || (pickId !== fight.fighterAId && pickId !== fight.fighterBId)) return `▫️ ${pair} · победил ${winner}`;
  if (pickId === fight.winnerFighterId) {
    const favoriteId = favoriteFighterId(fight);
    return `✅ ${pair} · победил ${winner}${favoriteId && favoriteId !== pickId ? " 🔥 против фаворита" : ""}`;
  }
  return `❌ ${pair} · пик ${pickId === fight.fighterAId ? nameA : nameB}, победил ${winner}`;
}

function formatEventScoreLine(fights: TelegramPicksFight[]) {
  const model = { correct: 0, judged: 0 };
  const favorite = { correct: 0, judged: 0 };
  for (const fight of fights) {
    const snapshot = fight.predictionSnapshot;
    if (!snapshot) continue;
    const outcome = { status: fight.status, resultType: fight.resultType, winnerFighterId: fight.winnerFighterId };
    const modelVerdict = resolveAiPickVerdict({ aiPickFighterId: snapshot.aiPickFighterId, ...outcome });
    const favoriteVerdict = resolvePredictionVerdict({
      percentA: snapshot.percentA,
      percentB: snapshot.percentB,
      fighterAId: fight.fighterAId,
      fighterBId: fight.fighterBId,
      ...outcome
    });
    for (const [bucket, verdict] of [[model, modelVerdict], [favorite, favoriteVerdict]] as const) {
      if (verdict === "correct" || verdict === "wrong") bucket.judged += 1;
      if (verdict === "correct") bucket.correct += 1;
    }
  }

  if (model.judged === 0) return "Пики модели в этом турнире в зачёт не попали";
  const percent = Math.round((model.correct / model.judged) * 100);
  const favoritePart = favorite.judged > 0 ? ` · фаворит по предматчевой оценке — ${favorite.correct} из ${favorite.judged}` : "";
  return `Угадала ${model.correct} из ${model.judged} (${percent}%)${favoritePart}`;
}

function formatEventsCount(count: number) {
  if (count === 1) return "За последний турнир";
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word =
    mod10 === 1 && mod100 !== 11 ? "турнир" : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? "турнира" : "турниров";
  return `За последние ${count} ${word}`;
}

function formatAccuracyLine(accuracy: TelegramResultsAccuracy) {
  if (accuracy.model.percent === null) return null;
  const favoritePart = accuracy.favorite.percent !== null ? `, фаворит — ${accuracy.favorite.percent}%` : "";
  return `${formatEventsCount(accuracy.eventsCount)}: ${accuracy.model.percent}% (${accuracy.model.correct} из ${accuracy.model.judged})${favoritePart}`;
}

export function buildTelegramResultsPost(event: TelegramPicksEvent, accuracy: TelegramResultsAccuracy, siteUrl: string) {
  const fights = event.fights.filter((fight) => fight.status === "completed");
  const head = `📊 Итоги ИИ-модели FightBase: ${event.name}\n${formatEventScoreLine(fights)}`;
  const cardBlocks = buildCardBlocks(fights, formatResultLine);
  const accuracyLine = formatAccuracyLine(accuracy);
  const footer = [accuracyLine, `Результаты и разборы: ${siteUrl.replace(/\/$/, "")}/ru/events/${event.slug}`]
    .filter(Boolean)
    .join("\n");
  const valueLines = sortFightsForCard(fights).flatMap((fight) => {
    const valuePick = resolveFightValuePick(fight);
    const units = resolveValueUnits(valuePick, fight);
    if (!valuePick || units === null) return [];
    return [`${formatValuePickLabel(fight, valuePick)} — ${units > 0 ? "сыграл" : "не сыграл"}`];
  });

  return fitTelegramText(
    (lines) => [head, ...cardBlocks, ...(lines.length > 0 ? [lines.join("\n")] : []), footer].join("\n\n"),
    valueLines
  );
}
```

- [ ] Тот же запуск → 13 тестов PASS.

### Task 3: Шаг итогов в исполнителе

**Files:** `lib/telegram-picks-runner.ts`

- [ ] Полный файл: общий `eventSelect` (со `status`), `resolveChatId()`, `runResultsStep` (посты без `resultsPostedAt`, решение, `getPredictionAccuracy()` один раз на прогон, отправка ответом, запись id сразу после отправки, ошибка → `telegram.results` и `resultsError`), прежняя логика пиков в `runPicksStep`:

```ts
// Исполнение постов ИИ-модели в Telegram-канале (решение и текст — lib/telegram-picks.ts).
// Каждый прогон сначала публикует итоги прошедших турниров ответом на их пост с
// пиками, затем ведёт пост с пиками ближайшего: отправка, правка до начала турнира,
// закреп нового поста и снятие закрепа с прошлого. Id сообщений сохраняются сразу
// после отправки, поэтому сбой закрепа или записи не приводит к повторной отправке.

import { createHash } from "node:crypto";

import { getPredictionAccuracy } from "@/lib/db/events";
import { isContenderSeries } from "@/lib/event-results";
import { prisma } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/site";
import { getTelegramApiBase } from "@/lib/social-publish";
import { recordSystemEvent } from "@/lib/system-events";
import {
  buildTelegramPicksPost,
  buildTelegramResultsPost,
  decideTelegramPicksAction,
  decideTelegramResultsAction,
  type TelegramPicksAction,
  type TelegramPicksEvent,
  type TelegramResultsAccuracy,
  type TelegramResultsAction
} from "@/lib/telegram-picks";

export type TelegramResultsRun = {
  action: TelegramResultsAction | "skipped";
  eventSlug: string;
  text?: string;
  messageId?: number;
};

export type TelegramPicksRunResult = {
  action: TelegramPicksAction | "none" | "skipped";
  eventSlug?: string;
  reason?: string;
  text?: string;
  messageId?: number;
  changed?: boolean;
  pinned?: boolean;
  unpinned?: number;
  results?: TelegramResultsRun[];
  resultsError?: string;
};

class TelegramApiError extends Error {
  constructor(
    readonly method: string,
    readonly status: number,
    readonly description: string
  ) {
    super(`Telegram ${method}: ${status} ${description}`);
  }
}

const fighterSelect = { id: true, name: true, nameRu: true } as const;

const eventSelect = {
  id: true,
  slug: true,
  name: true,
  status: true,
  date: true,
  earlyPrelimsAt: true,
  prelimsAt: true,
  mainCardAt: true,
  fights: {
    select: {
      id: true,
      stage: true,
      boutOrder: true,
      isMainEvent: true,
      createdAt: true,
      status: true,
      resultType: true,
      winnerFighterId: true,
      fighterAId: true,
      fighterBId: true,
      fighterA: { select: fighterSelect },
      fighterB: { select: fighterSelect },
      predictionSnapshot: {
        select: {
          aiPickFighterId: true,
          percentA: true,
          percentB: true,
          aiWinChanceA: true,
          oddsAAtPick: true,
          oddsBAtPick: true
        }
      }
    }
  }
} as const;

async function loadNextEvent(): Promise<TelegramPicksEvent | null> {
  const events = await prisma.event.findMany({
    where: { status: "upcoming" },
    orderBy: { date: "asc" },
    take: 5,
    select: eventSelect
  });
  return events.find((event) => !isContenderSeries(event.name)) ?? null;
}

function hashText(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

// Флаг стоит только в .env на сервере: локальный .env содержит тот же токен и
// канал, а адрес сайта и при локальном запуске — https://fightbase.ru.
function resolveChatId() {
  const chatId = process.env.TELEGRAM_CHANNEL_ID;
  return process.env.TELEGRAM_PICKS_ENABLED === "1" && process.env.TELEGRAM_BOT_TOKEN && chatId ? chatId : null;
}

async function callBot(method: string, body: Record<string, unknown>) {
  const response = await fetch(`${getTelegramApiBase()}/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000)
  });
  const payload = (await response.json().catch(() => null)) as { ok?: boolean; result?: unknown; description?: string } | null;
  if (!response.ok || !payload?.ok) {
    throw new TelegramApiError(method, response.status, payload?.description ?? "");
  }
  return payload.result;
}

async function editPostText(chatId: string, messageId: number, text: string) {
  try {
    await callBot("editMessageText", { chat_id: chatId, message_id: messageId, text, link_preview_options: { is_disabled: true } });
  } catch (error) {
    // Текст в Telegram уже такой (например, прошлая правка прошла, а запись в базу — нет).
    if (error instanceof TelegramApiError && error.description.includes("message is not modified")) return;
    throw error;
  }
}

async function pinAndReleasePrevious(chatId: string, eventId: string, messageId: number) {
  await callBot("pinChatMessage", { chat_id: chatId, message_id: messageId, disable_notification: true });
  await prisma.telegramEventPost.update({ where: { eventId }, data: { pinnedAt: new Date() } });

  const previous = await prisma.telegramEventPost.findMany({ where: { eventId: { not: eventId }, unpinnedAt: null } });
  for (const post of previous) {
    try {
      await callBot("unpinChatMessage", { chat_id: chatId, message_id: post.messageId });
    } catch (error) {
      // 400 — сообщение уже не закреплено или удалено руками; снимать нечего.
      if (!(error instanceof TelegramApiError && error.status === 400)) throw error;
    }
    await prisma.telegramEventPost.update({ where: { eventId: post.eventId }, data: { unpinnedAt: new Date() } });
  }
  return { pinned: true, unpinned: previous.length };
}

// Итоги публикуются только для турниров, у которых в канале уже есть пост с пиками.
async function runResultsStep({
  now,
  dryRun,
  siteUrl,
  chatId
}: {
  now: Date;
  dryRun: boolean;
  siteUrl: string;
  chatId: string | null;
}): Promise<Pick<TelegramPicksRunResult, "results" | "resultsError">> {
  const pending = await prisma.telegramEventPost.findMany({
    where: { resultsPostedAt: null },
    select: { eventId: true, messageId: true }
  });
  const results: TelegramResultsRun[] = [];
  let accuracy: TelegramResultsAccuracy | null = null;

  for (const post of pending) {
    const event = await prisma.event.findUnique({ where: { id: post.eventId }, select: eventSelect });
    if (!event) continue;
    const action = decideTelegramResultsAction({ event, hasResultsPost: false, now });
    if (action !== "post") {
      results.push({ action, eventSlug: event.slug });
      continue;
    }

    accuracy ??= await getPredictionAccuracy();
    const text = buildTelegramResultsPost(event, accuracy, siteUrl);
    if (dryRun) {
      results.push({ action, eventSlug: event.slug, text });
      continue;
    }
    if (!chatId) {
      results.push({ action: "skipped", eventSlug: event.slug });
      continue;
    }

    try {
      const sent = (await callBot("sendMessage", {
        chat_id: chatId,
        text,
        link_preview_options: { is_disabled: true },
        reply_parameters: { message_id: post.messageId, allow_sending_without_reply: true }
      })) as { message_id: number };
      await prisma.telegramEventPost.update({
        where: { eventId: event.id },
        data: { resultsMessageId: sent.message_id, resultsPostedAt: new Date() }
      });
      results.push({ action, eventSlug: event.slug, messageId: sent.message_id });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await recordSystemEvent({
        level: "error",
        category: "telegram.results",
        message,
        source: "api/cron/telegram-picks",
        meta: { eventSlug: event.slug }
      });
      return { results, resultsError: message };
    }
  }

  return { results };
}

async function runPicksStep({
  now,
  dryRun,
  siteUrl,
  chatId
}: {
  now: Date;
  dryRun: boolean;
  siteUrl: string;
  chatId: string | null;
}): Promise<TelegramPicksRunResult> {
  const event = await loadNextEvent();
  if (!event) return { action: "none" };

  const post = await prisma.telegramEventPost.findUnique({ where: { eventId: event.id } });
  const action = decideTelegramPicksAction({ event, hasPost: Boolean(post), now });
  const text = buildTelegramPicksPost(event, siteUrl);
  const base = { action, eventSlug: event.slug };
  if (dryRun) return { ...base, text };
  if (!chatId) {
    return { action: "skipped", eventSlug: event.slug, reason: "TELEGRAM_PICKS_ENABLED is off or Telegram is not configured" };
  }

  try {
    if (action === "post") {
      const sent = (await callBot("sendMessage", {
        chat_id: chatId,
        text,
        link_preview_options: { is_disabled: true }
      })) as { message_id: number };
      await prisma.telegramEventPost.create({ data: { eventId: event.id, messageId: sent.message_id, textHash: hashText(text) } });
      return { ...base, messageId: sent.message_id, ...(await pinAndReleasePrevious(chatId, event.id, sent.message_id)) };
    }

    if (action === "edit" && post) {
      const changed = post.textHash !== hashText(text);
      if (changed) {
        await editPostText(chatId, post.messageId, text);
        await prisma.telegramEventPost.update({ where: { eventId: event.id }, data: { textHash: hashText(text) } });
      }
      const pin = post.pinnedAt ? {} : await pinAndReleasePrevious(chatId, event.id, post.messageId);
      return { ...base, messageId: post.messageId, changed, ...pin };
    }

    return base;
  } catch (error) {
    await recordSystemEvent({
      level: "error",
      category: "telegram.picks",
      message: error instanceof Error ? error.message : String(error),
      source: "api/cron/telegram-picks",
      meta: { eventSlug: event.slug, action }
    });
    throw error;
  }
}

export async function runTelegramPicks({ now = new Date(), dryRun = false } = {}): Promise<TelegramPicksRunResult> {
  const options = { now, dryRun, siteUrl: getSiteUrl().toString().replace(/\/$/, ""), chatId: resolveChatId() };
  // Ошибка итогов не мешает посту с пиками: она уже записана в системные события.
  const results = await runResultsStep(options);
  return { ...(await runPicksStep(options)), ...results };
}
```

- [ ] `npx tsc --noEmit` → без ошибок; `npm test` → всё PASS; `npm run build` → успешно.

### Task 4: Выкатка и проверка (после разрешения на пуш)

- [ ] После пуша: перезапуск `fightbase.service` позже пуша (сравнение в секундах), в `_prisma_migrations` есть `20261027150000_add_telegram_results_post`.
- [ ] Dry-run: `POST /api/cron/telegram-picks` с `{"dryRun":true}` и `Authorization: Bearer ${INTERNAL_API_SECRET:-$INGEST_CRON_SECRET}` — `results: []` (постов с пиками ещё нет), шаг пиков как раньше.
- [ ] Предпросмотр текста итогов на UFC 333 без записи в базу (тот же `buildTelegramResultsPost` на прод-данных).
- [ ] Утро 01.11: пост с итогами Fight Night Moicano vs. Nolan вышел ответом на пост с пиками, в `TelegramEventPost` заполнены `resultsMessageId` и `resultsPostedAt`.
