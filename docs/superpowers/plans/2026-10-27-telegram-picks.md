# Пики карда в Telegram и призыв подписаться — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** раз в час публиковать в канал t.me/fightbase пост с пиками ИИ-модели FightBase на ближайший турнир, править его до начала, держать в закрепе до следующего турнира и звать в канал со страниц прогнозов.

**Architecture:** чистые функции решения и текста в `lib/telegram-picks.ts` (покрыты тестом), исполнитель с Bot API и Prisma в `lib/telegram-picks-runner.ts`, эндпоинт `/api/cron/telegram-picks`, задача `telegram-picks` в `scripts/cron-tasks.sh`. Состояние поста — таблица `TelegramEventPost`. Призыв — серверный компонент `TelegramPicksCta`.

**Tech Stack:** Next.js app router, Prisma (Postgres на проде, SQLite локально), `node --import tsx --test`, Telegram Bot API через `fetch`.

Спека: `docs/superpowers/specs/2026-10-27-telegram-picks-design.md`.

**Коммиты:** пользователь разрешает коммит и пуш только явной просьбой. Шаги «Commit» ниже — точки, где изменения готовы к коммиту; выполнять их только после разрешения, иначе просто идти дальше.

---

### Task 1: Таблица TelegramEventPost

**Files:**
- Modify: `prisma/schema.postgres.prisma` (модель Event ~182, конец файла)
- Modify: `prisma/schema.prisma` (те же места)
- Create: `prisma/migrations/20261027120000_add_telegram_event_post/migration.sql`

- [ ] **Step 1: Добавить back-relation в Event в обеих схемах**

В `model Event` после строки `slugAliases EventSlugAlias[]`:

```prisma
  telegramPost TelegramEventPost?
```

- [ ] **Step 2: Добавить модель в конец обеих схем**

```prisma
// Пост с пиками турнира в Telegram-канале: id сообщения для правки и закрепа,
// хэш текста — чтобы править только при изменениях (lib/telegram-picks-runner.ts).
model TelegramEventPost {
  eventId    String    @id
  messageId  Int
  textHash   String
  postedAt   DateTime  @default(now())
  pinnedAt   DateTime?
  unpinnedAt DateTime?
  updatedAt  DateTime  @updatedAt
  event      Event     @relation(fields: [eventId], references: [id], onDelete: Cascade)

  @@index([unpinnedAt])
}
```

- [ ] **Step 3: Написать миграцию**

`prisma/migrations/20261027120000_add_telegram_event_post/migration.sql`:

```sql
CREATE TABLE "TelegramEventPost" (
    "eventId" TEXT NOT NULL,
    "messageId" INTEGER NOT NULL,
    "textHash" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pinnedAt" TIMESTAMP(3),
    "unpinnedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramEventPost_pkey" PRIMARY KEY ("eventId")
);

CREATE INDEX "TelegramEventPost_unpinnedAt_idx" ON "TelegramEventPost"("unpinnedAt");

ALTER TABLE "TelegramEventPost" ADD CONSTRAINT "TelegramEventPost_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 4: Сгенерировать клиент под Postgres**

Run: `npm run prisma:generate:pg`
Expected: `Generated Prisma Client`. Голый `prisma generate` не запускать — он берёт SQLite-схему и ломает typecheck.

- [ ] **Step 5: Проверить схемы**

Run: `npx prisma validate --schema prisma/schema.postgres.prisma; npx prisma validate --schema prisma/schema.prisma`
Expected: обе `is valid`.

- [ ] **Step 6: Commit** (по разрешению)

```bash
git add prisma/schema.prisma prisma/schema.postgres.prisma prisma/migrations/20261027120000_add_telegram_event_post
git commit -m "feat: TelegramEventPost table for the card picks post"
```

---

### Task 2: Решение и текст поста (чистые функции)

**Files:**
- Create: `lib/telegram-picks.ts`
- Test: `tests/telegram-picks.test.ts`

- [ ] **Step 1: Написать падающий тест**

`tests/telegram-picks.test.ts`:

```ts
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
```

- [ ] **Step 2: Запустить тест — должен упасть**

Run: `node --import tsx --test tests/telegram-picks.test.ts`
Expected: FAIL, `Cannot find module '../lib/telegram-picks'`.

- [ ] **Step 3: Написать `lib/telegram-picks.ts`**

```ts
// Пост с пиками ИИ-модели FightBase на весь кард для Telegram-канала: когда его
// публиковать и что в нём писать. Bot API и база — в lib/telegram-picks-runner.ts,
// здесь только чистые функции. Пик и процент считает describeFightPick — тот же,
// что в карде на сайте, чтобы канал и страница турнира не расходились.

import { getDisplayName } from "@/lib/display";
import { describeFightPick } from "@/lib/event-picks";
import { formatCardNightLabel, formatCardTime } from "@/lib/event-time";
import { sortFightsForCard, type FightCardSortable } from "@/lib/fight-card";
import { resolveValuePick } from "@/lib/prediction-value";

// Пики части боёв считаются за недели до турнира, поэтому без окна пост ушёл бы
// за месяц. За 36 часов публикуем и неполный кард: остальные пики допишет правка.
export const POST_WINDOW_HOURS = 72;
export const PARTIAL_POST_HOURS = 36;
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
  date: Date;
  earlyPrelimsAt: Date | null;
  prelimsAt: Date | null;
  mainCardAt: Date | null;
  fights: TelegramPicksFight[];
};

export type TelegramPicksAction = "post" | "edit" | "wait" | "closed";

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

function formatFightLine(fight: TelegramPicksFight) {
  const nameA = getDisplayName(fight.fighterA, "ru");
  const nameB = getDisplayName(fight.fighterB, "ru");
  const pick = describeFightPick(fight);
  const verdict = pick ? `${pick.side === "A" ? nameA : nameB}, ${pick.percent}%` : "пик позже";
  return `• ${nameA} — ${nameB} → ${verdict}`;
}

function formatValuePickLines(fights: TelegramPicksFight[]) {
  return fights.flatMap((fight) => {
    const snapshot = fight.predictionSnapshot;
    if (!snapshot) return [];
    const valuePick = resolveValuePick({
      aiWinChanceA: snapshot.aiWinChanceA,
      oddsAAtPick: snapshot.oddsAAtPick,
      oddsBAtPick: snapshot.oddsBAtPick,
      fighterAId: fight.fighterAId,
      fighterBId: fight.fighterBId
    });
    if (!valuePick) return [];
    const name = getDisplayName(valuePick.side === "A" ? fight.fighterA : fight.fighterB, "ru");
    return [`💎 Ценный выбор: ${name} (кэф ${valuePick.odds.toFixed(2).replace(".", ",")})`];
  });
}

export function buildTelegramPicksPost(event: TelegramPicksEvent, siteUrl: string) {
  const fights = sortFightsForCard(event.fights.filter((fight) => fight.status === "scheduled"));
  const isMainCard = (fight: TelegramPicksFight) => Boolean(fight.isMainEvent) || fight.stage === "main_card";
  const groups: Array<[string, TelegramPicksFight[]]> = [
    ["Основной кард", fights.filter(isMainCard)],
    ["Прелимы", fights.filter((fight) => !isMainCard(fight))]
  ];

  const head = `🥊 Пики ИИ-модели FightBase: ${event.name}\n${formatEventDateLine(event)}`;
  const cardBlocks = groups
    .filter(([, list]) => list.length > 0)
    .map(([title, list]) => [title, ...list.map(formatFightLine)].join("\n"));
  const link = `Все разборы: ${siteUrl.replace(/\/$/, "")}/ru/events/${event.slug}`;
  const compose = (valueLines: string[]) =>
    [head, ...cardBlocks, ...(valueLines.length > 0 ? [valueLines.join("\n")] : []), link].join("\n\n");

  let valueLines = formatValuePickLines(fights);
  let text = compose(valueLines);
  while (text.length > TELEGRAM_TEXT_MAX && valueLines.length > 0) {
    valueLines = valueLines.slice(0, -1);
    text = compose(valueLines);
  }
  return text.length > TELEGRAM_TEXT_MAX ? `${text.slice(0, TELEGRAM_TEXT_MAX - 1).trimEnd()}…` : text;
}
```

- [ ] **Step 4: Запустить тест — должен пройти**

Run: `node --import tsx --test tests/telegram-picks.test.ts`
Expected: все тесты PASS. Если упал тест ценного выбора — проверить расчёт: шанс B = 60%, 0,60 × 2,40 − 1 = +44% ≥ 5%, сторона B; шанс A = 40%, 0,40 × 1,5 − 1 = −40%.

- [ ] **Step 5: Commit** (по разрешению)

```bash
git add lib/telegram-picks.ts tests/telegram-picks.test.ts
git commit -m "feat: decide and compose the Telegram card picks post"
```

---

### Task 3: Исполнитель: Bot API, база, закреп

**Files:**
- Modify: `lib/social-publish.ts:214` (экспорт `getTelegramApiBase`)
- Create: `lib/telegram-picks-runner.ts`

- [ ] **Step 1: Экспортировать `getTelegramApiBase`**

В `lib/social-publish.ts` заменить `function getTelegramApiBase(): string {` на:

```ts
export function getTelegramApiBase(): string {
```

- [ ] **Step 2: Написать `lib/telegram-picks-runner.ts`**

```ts
// Исполнение поста с пиками в Telegram-канале (решение и текст — lib/telegram-picks.ts):
// отправка, правка до начала турнира, закреп нового поста и снятие закрепа с прошлого.
// Запись о посте сохраняется сразу после отправки, поэтому сбой закрепа не приводит
// к повторной отправке: закреп повторится на следующем запуске.

import { createHash } from "node:crypto";

import { isContenderSeries } from "@/lib/event-results";
import { prisma } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/site";
import { getTelegramApiBase } from "@/lib/social-publish";
import { recordSystemEvent } from "@/lib/system-events";
import {
  buildTelegramPicksPost,
  decideTelegramPicksAction,
  type TelegramPicksAction,
  type TelegramPicksEvent
} from "@/lib/telegram-picks";

export type TelegramPicksRunResult = {
  action: TelegramPicksAction | "none" | "skipped";
  eventSlug?: string;
  reason?: string;
  text?: string;
  messageId?: number;
  changed?: boolean;
  pinned?: boolean;
  unpinned?: number;
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

async function loadNextEvent(): Promise<TelegramPicksEvent | null> {
  const events = await prisma.event.findMany({
    where: { status: "upcoming" },
    orderBy: { date: "asc" },
    take: 5,
    select: {
      id: true,
      slug: true,
      name: true,
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
    }
  });
  return events.find((event) => !isContenderSeries(event.name)) ?? null;
}

function hashText(text: string) {
  return createHash("sha256").update(text).digest("hex");
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

export async function runTelegramPicks({ now = new Date(), dryRun = false } = {}): Promise<TelegramPicksRunResult> {
  const siteUrl = getSiteUrl().toString().replace(/\/$/, "");
  const event = await loadNextEvent();
  if (!event) return { action: "none" };

  const post = await prisma.telegramEventPost.findUnique({ where: { eventId: event.id } });
  const action = decideTelegramPicksAction({ event, hasPost: Boolean(post), now });
  const text = buildTelegramPicksPost(event, siteUrl);
  const base = { action, eventSlug: event.slug };
  if (dryRun) return { ...base, text };

  // Флаг стоит только в .env на сервере: локальный .env содержит тот же токен и
  // канал, а адрес сайта и при локальном запуске — https://fightbase.ru.
  const chatId = process.env.TELEGRAM_CHANNEL_ID;
  if (process.env.TELEGRAM_PICKS_ENABLED !== "1" || !process.env.TELEGRAM_BOT_TOKEN || !chatId) {
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
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: без ошибок. Если Prisma ругается на `telegramEventPost` — не выполнен Task 1 Step 4 (`npm run prisma:generate:pg`). Если `stage` не совместим с `string | null` — это enum Prisma (строковый литерал), совместим; ошибка значит, что `select` не совпадает с `TelegramPicksFight`.

- [ ] **Step 4: Commit** (по разрешению)

```bash
git add lib/social-publish.ts lib/telegram-picks-runner.ts
git commit -m "feat: post, edit and pin the card picks in the Telegram channel"
```

---

### Task 4: Эндпоинт и задача по расписанию

**Files:**
- Create: `app/api/cron/telegram-picks/route.ts`
- Modify: `scripts/cron-tasks.sh` (перед `  *)` ~454 и строка Usage)

- [ ] **Step 1: Написать эндпоинт**

`app/api/cron/telegram-picks/route.ts`:

```ts
import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/api-security";
import { logger } from "@/lib/logger";
import { runTelegramPicks } from "@/lib/telegram-picks-runner";

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request, {
    allowInternalToken: true,
    rateLimit: {
      scope: "api:cron:telegram-picks",
      limit: 6,
      windowMs: 60_000
    }
  });

  if (!authorization.ok) {
    return authorization.response;
  }

  const headers = { "cache-control": "no-store", "x-request-id": authorization.context.requestId };
  const body = await request.json().catch(() => ({}));
  const dryRun = (body as { dryRun?: unknown }).dryRun === true;

  try {
    const result = await runTelegramPicks({ dryRun });
    if (result.action === "post" || result.changed) {
      logger.info("Telegram picks post updated", { ...authorization.context, ...result, text: undefined });
    }
    return NextResponse.json({ ok: true, ...result }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("Telegram picks run failed", { ...authorization.context, error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 502, headers });
  }
}
```

- [ ] **Step 2: Добавить задачу в `scripts/cron-tasks.sh`**

Перед веткой `  *)`:

```bash
  telegram-picks)
    # Раз в час: пост с пиками ближайшего турнира в Telegram-канал, правка до
    # начала турнира и закреп до следующего (lib/telegram-picks-runner.ts).
    log "Starting telegram-picks"
    response=$(call_api "/api/cron/telegram-picks") || {
      rc=$?
      log "telegram-picks FAILED ($(describe_curl_failure "${rc}"))"
      exit 1
    }
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n -1)
    log "telegram-picks HTTP ${http_code}: ${body}"
    ;;
```

В строке `echo "Usage: $0 {…|retry-predictions}"` дописать `|telegram-picks` перед `}`.

- [ ] **Step 3: Тесты cron-tasks**

Run: `node --import tsx --test tests/cron-tasks.test.ts`
Expected: PASS (проверка синтаксиса `bash -n` и ловушки `${var:-{...}}`).

- [ ] **Step 4: Commit** (по разрешению)

```bash
git add app/api/cron/telegram-picks/route.ts scripts/cron-tasks.sh
git commit -m "feat: hourly telegram-picks cron task"
```

---

### Task 5: Призыв на сайте и правка главной

**Files:**
- Create: `components/telegram-picks-cta.tsx`
- Modify: `app/predictions/[eventSlug]/[fightSlug]/page.tsx:604-606`
- Modify: `app/predictions/(list)/page.tsx` (после секции точности, перед `eventsWithSnapshots.length === 0`)
- Modify: `app/(home)/page.tsx:503-504`
- Modify: `lib/metrika.ts:3-4`

- [ ] **Step 1: Написать компонент**

`components/telegram-picks-cta.tsx`:

```tsx
import { MetrikaGoalLink } from "@/components/metrika-goal-link";
import type { Locale } from "@/lib/locale-config";

// Призыв в Telegram-канал на страницах прогнозов: канал за 2–3 дня до турнира
// закрепляет пики на весь кард (lib/telegram-picks-runner.ts).
export function TelegramPicksCta({ locale, className = "policy-card" }: { locale: Locale; className?: string }) {
  const telegramUrl = process.env.NEXT_PUBLIC_TELEGRAM_URL?.trim() || "";
  if (!telegramUrl || telegramUrl === "https://t.me/" || telegramUrl === "https://t.me") {
    return null;
  }

  const isRu = locale === "ru";
  return (
    <section className={className} aria-label={isRu ? "Пики в Telegram" : "Picks on Telegram"}>
      <h3>{isRu ? "Пики на весь кард — в Telegram" : "Full-card picks on Telegram"}</h3>
      <p className="copy">
        {isRu
          ? "За 2–3 дня до турнира закрепляем в канале пики ИИ-модели FightBase на все бои карда. Между турнирами — главные новости UFC."
          : "2–3 days before each event we pin the FightBase AI picks for every bout on the card. Between events — the main UFC news."}
      </p>
      <div className="home-follow-row">
        <MetrikaGoalLink href={telegramUrl} goal="prediction_telegram_click" className="button" ariaLabel="FightBase Telegram">
          {isRu ? "Подписаться" : "Subscribe"}
        </MetrikaGoalLink>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Вставить на страницу прогноза боя**

В `app/predictions/[eventSlug]/[fightSlug]/page.tsx` импорт рядом с `ShareButtons`:

```tsx
import { TelegramPicksCta } from "@/components/telegram-picks-cta";
```

И между `CardPredictionsList` и `ShareButtons`:

```tsx
          <CardPredictionsList fights={cardFights} currentFightId={fight.id} event={fight.event} locale={locale} />

          <TelegramPicksCta locale={locale} className="prediction-section-card" />

          <ShareButtons url={pageUrl} title={prediction.headline} locale={locale} />
```

- [ ] **Step 3: Вставить в хаб прогнозов**

В `app/predictions/(list)/page.tsx` импорт:

```tsx
import { TelegramPicksCta } from "@/components/telegram-picks-cta";
```

Сразу после закрывающего `) : null}` секции «Как отрабатывают прогнозы» и перед `{eventsWithSnapshots.length === 0 ? (`:

```tsx
      <TelegramPicksCta locale={locale} />
```

- [ ] **Step 4: Поправить текст главной**

В `app/(home)/page.tsx` заменить

```tsx
                ? "Кард, пики и результаты турнирного вечера — в Telegram и VK, а push в браузере напомнит перед главным кардом."
                : "Card, picks, and results of fight night in Telegram and VK, plus a browser push before the main card."}
```

на

```tsx
                ? "Пики на весь кард и новости UFC — в Telegram и VK, а push в браузере напомнит перед главным кардом."
                : "Full-card picks and UFC news in Telegram and VK, plus a browser push before the main card."}
```

- [ ] **Step 5: Дописать цель в комментарий `lib/metrika.ts`**

```ts
// push_subscribe_click, social_telegram_click, social_vk_click,
// share_telegram, share_vk, share_copy, prediction_telegram_click.
```

- [ ] **Step 6: Typecheck и тесты**

Run: `npx tsc --noEmit; npm test`
Expected: без ошибок, все тесты PASS.

- [ ] **Step 7: Commit** (по разрешению)

```bash
git add components/telegram-picks-cta.tsx "app/predictions/[eventSlug]/[fightSlug]/page.tsx" "app/predictions/(list)/page.tsx" "app/(home)/page.tsx" lib/metrika.ts
git commit -m "feat: Telegram picks call to action on prediction pages"
```

---

### Task 6: Сборка и локальная проверка

- [ ] **Step 1: Сборка**

Run: `npm run build`
Expected: успешная сборка, маршрут `/api/cron/telegram-picks` в списке.

- [ ] **Step 2: Локальный dry-run**

Запустить dev-сервер через `preview_start` и отправить `POST /api/cron/telegram-picks` с `{"dryRun":true}` и внутренним токеном (как в `call_api` из `scripts/cron-tasks.sh`). Локальная база не копия прода, поэтому ответ может быть `{"action":"none"}` — это нормально. Без `dryRun` локально ожидается `"skipped"` (нет `TELEGRAM_PICKS_ENABLED`).

- [ ] **Step 3: Призыв на телефоне**

Во встроенном браузере на ширине 375 открыть локальную страницу прогноза и `/ru/predictions`: блок виден, кнопка ведёт на t.me/fightbase.

---

### Task 7: Выкатка и проверка на проде (после разрешения на пуш)

- [ ] **Step 1: Пуш и ожидание деплоя**

После `git push` дождаться перезапуска сервиса: `ActiveEnterTimestamp` у `fightbase.service` позже времени пуша (сравнивать с датой, не строкой HH:MM:SS). Проверить, что миграция применилась: `select count(*) from "TelegramEventPost"` возвращает 0 без ошибки.

- [ ] **Step 2: Dry-run на проде**

```bash
ssh -i ~/.ssh/fightbase_deploy root@fightbase.ru 'cd /opt/fightbase && set -a && . ./.env && set +a && curl -s -X POST http://localhost:3000/api/cron/telegram-picks -H "Content-Type: application/json" -H "Authorization: Bearer ${INTERNAL_API_SECRET:-$INGEST_CRON_SECRET}" -d "{\"dryRun\":true}"'
```

Expected: `eventSlug` — UFC Fight Night: Moicano vs. Nolan (01.11), `action` — `wait` до ~29.10, текст совпадает с кардом на `/ru/events/<slug>`.

- [ ] **Step 3: Флаг и строка в crontab**

Дописать `TELEGRAM_PICKS_ENABLED=1` в `/opt/fightbase/.env` и перезапустить `fightbase.service`, иначе эндпоинт отвечает `"skipped"`.

Добавить в crontab пользователя `fightbase` (`crontab -u fightbase -e` или через `/var/spool/cron/crontabs/fightbase` с `crontab -u fightbase`) строку по образцу соседних задач с временем `25 * * * *` и аргументом `telegram-picks`. Проверить на следующем запуске: в `/var/log/fightbase/cron.log` строка `telegram-picks HTTP 200`.

- [ ] **Step 4: Цель в Метрике**

Завести цель «Прогноз: переход в Telegram» (JavaScript-событие `prediction_telegram_click`) через Management API токеном из `ops/reports/analytics/yandex.env`: `POST https://api-metrika.yandex.net/management/v1/counter/{id}/goals` с телом `{"goal":{"name":"Прогноз: переход в Telegram","type":"action","conditions":[{"type":"exact","url":"prediction_telegram_click"}]}}`. Если токен без прав на запись — завести в кабинете через встроенный браузер.

- [ ] **Step 5: Первый настоящий пост**

Около 29.10 (72 часа до начала Moicano vs. Nolan) проверить канал: пост вышел, закреплён над приветственным, в `TelegramEventPost` есть `pinnedAt`. После 01.11 и следующего поста (Bonfim vs. Brady, ~05.11) — у старого поста `unpinnedAt` заполнен, в канале закреплён новый.

- [ ] **Step 6: Призыв на проде**

Во встроенном браузере на ширине телефона: страница прогноза UFC 334 и `/ru/predictions` — блок на месте; главная — новый текст.
