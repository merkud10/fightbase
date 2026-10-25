# Блок «Другие прогнозы на кард» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** На странице прогноза боя показать список прогнозов на остальные бои того же турнира со ссылками, пиком модели или итогом.

**Architecture:** Чистая функция `buildCardPredictionRows` (`lib/card-predictions.ts`) сортирует бои карда и считает состояние строки через уже существующий `describeFightPick`. `getFightPredictionPageData` отдаёт бои карда одним дополнительным запросом. Серверный компонент `CardPredictionsList` рендерит строки на существующих классах `event-fight-*`; страница прогноза ставит его перед кнопками шаринга.

**Tech Stack:** Next.js (app router, серверные компоненты), Prisma (Postgres), TypeScript, тесты `node:test` через `tsx`.

Спека: `docs/superpowers/specs/2026-10-25-card-predictions-block-design.md`.

---

## Файлы

- Create: `lib/card-predictions.ts` — чистая логика строк блока.
- Create: `tests/card-predictions.test.ts` — юнит-тесты логики.
- Create: `components/card-predictions-list.tsx` — вёрстка блока, ru/en.
- Modify: `lib/db/events.ts` (`getFightPredictionPageData`, около стр. 508) — добавить `cardFights`.
- Modify: `app/predictions/[eventSlug]/[fightSlug]/page.tsx` — достать `cardFights`, вставить компонент перед `<ShareButtons>`.
- Modify: `app/globals.css` — два правила для строки-ссылки.

---

### Task 1: Логика строк блока

**Files:**
- Create: `lib/card-predictions.ts`
- Test: `tests/card-predictions.test.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { buildCardPredictionRows } from "../lib/card-predictions";

function fight(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    slug: `${id}-slug`,
    stage: "main_card",
    boutOrder: null as number | null,
    isMainEvent: false,
    status: "scheduled",
    resultType: null as string | null,
    winnerFighterId: null as string | null,
    fighterAId: `${id}-a`,
    fighterBId: `${id}-b`,
    fighterA: { id: `${id}-a` },
    fighterB: { id: `${id}-b` },
    predictionSnapshot: { aiPickFighterId: `${id}-a`, percentA: 62, percentB: 38 } as
      | { aiPickFighterId: string | null; percentA: number; percentB: number }
      | null,
    ...overrides
  };
}

test("buildCardPredictionRows drops the current fight and keeps card order with the main event first", () => {
  const rows = buildCardPredictionRows(
    [
      fight("prelim", { stage: "prelims", boutOrder: 1 }),
      fight("current", { boutOrder: 2 }),
      fight("co-main", { boutOrder: 3 }),
      fight("main", { isMainEvent: true, boutOrder: 9 })
    ],
    "current"
  );
  assert.deepEqual(rows.map((row) => row.fight.id), ["main", "co-main", "prelim"]);
});

test("buildCardPredictionRows skips fights without a page", () => {
  const rows = buildCardPredictionRows(
    [fight("no-slug", { slug: null }), fight("no-snapshot", { predictionSnapshot: null }), fight("ok")],
    "current"
  );
  assert.deepEqual(rows.map((row) => row.fight.id), ["ok"]);
});

test("buildCardPredictionRows describes an upcoming pick, a pending pick and finished fights", () => {
  const rows = buildCardPredictionRows(
    [
      fight("pick", { boutOrder: 1, predictionSnapshot: { aiPickFighterId: "pick-b", percentA: 45, percentB: 55 } }),
      fight("pending", { boutOrder: 2, predictionSnapshot: { aiPickFighterId: null, percentA: 50, percentB: 50 } }),
      fight("hit", { boutOrder: 3, status: "completed", resultType: "win", winnerFighterId: "hit-a" }),
      fight("miss", { boutOrder: 4, status: "completed", resultType: "win", winnerFighterId: "miss-b" }),
      fight("draw", { boutOrder: 5, status: "completed", resultType: "draw" })
    ],
    "current"
  );
  assert.deepEqual(
    rows.map((row) => row.state),
    [
      { kind: "pick", side: "B", percent: 55 },
      { kind: "pending" },
      { kind: "result", winnerSide: "A", pickVerdict: "correct" },
      { kind: "result", winnerSide: "B", pickVerdict: "wrong" },
      { kind: "winnerless", resultType: "draw" }
    ]
  );
});

test("buildCardPredictionRows returns nothing when the card has no other predictions", () => {
  assert.deepEqual(buildCardPredictionRows([fight("current")], "current"), []);
});
```

- [ ] **Step 2: Запустить тест, убедиться, что падает**

Run: `node --import tsx --test tests/card-predictions.test.ts`
Expected: FAIL — `Cannot find module '../lib/card-predictions'`.

- [ ] **Step 3: Минимальная реализация**

```ts
// Строки блока «Другие прогнозы на кард» на странице прогноза: остальные бои
// турнира со страницей прогноза, в порядке карда, с пиком модели или итогом.
// Пик и вердикт считает describeFightPick — тот же, что в таблице карда на
// странице турнира, чтобы обе страницы показывали одно и то же.

import { describeFightPick } from "@/lib/event-picks";
import { sortFightsForCard, type FightCardSortable } from "@/lib/fight-card";

type CardFight = FightCardSortable & {
  slug: string | null;
  status: string;
  resultType: string | null;
  winnerFighterId: string | null;
  fighterAId: string;
  fighterBId: string;
  fighterA: { id: string };
  fighterB: { id: string };
  predictionSnapshot: { aiPickFighterId: string | null; percentA: number; percentB: number } | null;
};

export type CardPredictionState =
  | { kind: "pick"; side: "A" | "B"; percent: number }
  | { kind: "pending" }
  | { kind: "result"; winnerSide: "A" | "B"; pickVerdict: "correct" | "wrong" | null }
  | { kind: "winnerless"; resultType: string | null };

export type CardPredictionRow<T extends CardFight> = { fight: T & { slug: string }; state: CardPredictionState };

function resolveState(fight: CardFight): CardPredictionState {
  const pick = describeFightPick(fight);
  if (fight.status !== "completed") {
    return pick ? { kind: "pick", side: pick.side, percent: pick.percent } : { kind: "pending" };
  }
  if (fight.resultType === "win" && fight.winnerFighterId) {
    const pickVerdict = pick?.verdict === "correct" || pick?.verdict === "wrong" ? pick.verdict : null;
    return { kind: "result", winnerSide: fight.winnerFighterId === fight.fighterAId ? "A" : "B", pickVerdict };
  }
  return { kind: "winnerless", resultType: fight.resultType };
}

export function buildCardPredictionRows<T extends CardFight>(fights: readonly T[], currentFightId: string): CardPredictionRow<T>[] {
  return sortFightsForCard(fights)
    .filter((fight): fight is T & { slug: string } => fight.id !== currentFightId && Boolean(fight.slug) && Boolean(fight.predictionSnapshot))
    .map((fight) => ({ fight, state: resolveState(fight) }));
}
```

- [ ] **Step 4: Запустить тест, убедиться, что проходит**

Run: `node --import tsx --test tests/card-predictions.test.ts`
Expected: PASS, 4 теста.

### Task 2: Бои карда в данных страницы

**Files:**
- Modify: `lib/db/events.ts` — функция `getFightPredictionPageData`.

- [ ] **Step 1: Добавить запрос после проверки `if (!fight || …) return null;`**

```ts
  // Остальные бои турнира со страницей прогноза — для блока «Другие прогнозы
  // на кард» (lib/card-predictions.ts).
  const cardFights = await prisma.fight.findMany({
    where: { eventId: fight.eventId, id: { not: fight.id }, slug: { not: null }, predictionSnapshot: { isNot: null } },
    select: {
      id: true,
      slug: true,
      stage: true,
      boutOrder: true,
      isMainEvent: true,
      createdAt: true,
      weightClass: true,
      status: true,
      resultType: true,
      winnerFighterId: true,
      fighterAId: true,
      fighterBId: true,
      fighterA: { select: { id: true, slug: true, name: true, nameRu: true } },
      fighterB: { select: { id: true, slug: true, name: true, nameRu: true } },
      predictionSnapshot: { select: { aiPickFighterId: true, percentA: true, percentB: true } }
    }
  });
```

- [ ] **Step 2: Добавить `cardFights` в возвращаемый объект функции** (рядом с `relatedArticles`).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: без ошибок.

### Task 3: Компонент и вставка на страницу

**Files:**
- Create: `components/card-predictions-list.tsx`
- Modify: `app/predictions/[eventSlug]/[fightSlug]/page.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Компонент**

```tsx
import Link from "next/link";

import { buildCardPredictionRows, type CardPredictionState } from "@/lib/card-predictions";
import { formatWeightClass, getDisplayName } from "@/lib/display";
import { pickPendingText } from "@/lib/event-picks";
import { formatWinnerlessFightResult } from "@/lib/fight-card";
import type { Locale } from "@/lib/locale-config";
import { localizePath } from "@/lib/locale-path";

type Fighter = { id: string; name: string; nameRu: string | null };

type CardFight = Parameters<typeof buildCardPredictionRows>[0][number] & {
  weightClass: string;
  fighterA: Fighter;
  fighterB: Fighter;
};

function describeState(state: CardPredictionState, fighterA: Fighter, fighterB: Fighter, locale: Locale) {
  const nameOf = (side: "A" | "B") => getDisplayName(side === "A" ? fighterA : fighterB, locale);
  switch (state.kind) {
    case "pick":
      return (
        <>
          {locale === "ru" ? "Пик: " : "Pick: "}
          <strong>{nameOf(state.side)}</strong> · {state.percent}%
        </>
      );
    case "pending":
      return pickPendingText(locale, "short");
    case "result":
      return (
        <>
          {locale === "ru" ? "Победа: " : "Winner: "}
          <strong>{nameOf(state.winnerSide)}</strong>
          {state.pickVerdict === "correct" ? " · пик ✓" : state.pickVerdict === "wrong" ? " · пик ✗" : ""}
        </>
      );
    case "winnerless":
      return formatWinnerlessFightResult(state.resultType, locale);
  }
}

export function CardPredictionsList({
  fights,
  currentFightId,
  event,
  locale
}: {
  fights: readonly CardFight[];
  currentFightId: string;
  event: { slug: string; name: string };
  locale: Locale;
}) {
  const rows = buildCardPredictionRows(fights, currentFightId);
  if (rows.length === 0) return null;

  return (
    <section className="prediction-section-card card-predictions" aria-labelledby="card-predictions-title">
      <h3 id="card-predictions-title">
        {locale === "ru" ? `Другие прогнозы на ${event.name}` : `More predictions for ${event.name}`}
      </h3>
      <div className="event-fight-list">
        {rows.map(({ fight, state }) => (
          <Link
            key={fight.id}
            href={localizePath(`/predictions/${event.slug}/${fight.slug}`, locale)}
            className="event-fight-row card-predictions-row"
          >
            <span className="event-fight-copy">
              <strong>
                {getDisplayName(fight.fighterA, locale)} — {getDisplayName(fight.fighterB, locale)}
              </strong>
              <span>
                {fight.isMainEvent ? (locale === "ru" ? "Главный бой · " : "Main event · ") : ""}
                {formatWeightClass(fight.weightClass, locale)}
              </span>
            </span>
            <span className="event-table-pick">{describeState(state, fight.fighterA, fight.fighterB, locale)}</span>
          </Link>
        ))}
      </div>
      <Link href={localizePath(`/events/${event.slug}`, locale)} className="event-table-link">
        {locale === "ru" ? "Весь кард и время по Москве →" : "Full card and start times →"}
      </Link>
    </section>
  );
}
```

Английский вердикт: в `case "result"` «пик ✓» для en заменить на «pick ✓»: `(locale === "ru" ? " · пик ✓" : " · pick ✓")`, то же для ✗.

- [ ] **Step 2: Страница.** Импорт `import { CardPredictionsList } from "@/components/card-predictions-list";`, в деструктуризации `data` добавить `cardFights`, перед `<ShareButtons … />` вставить:

```tsx
          <CardPredictionsList fights={cardFights} currentFightId={fight.id} event={fight.event} locale={locale} />
```

- [ ] **Step 3: CSS** в `app/globals.css` после правил `.event-table-pick strong`:

```css
/* Блок «Другие прогнозы на кард» на странице прогноза */
.card-predictions {
  display: grid;
  gap: 14px;
}

.card-predictions-row {
  color: inherit;
  text-decoration: none;
}
```

- [ ] **Step 4: Typecheck и тесты**

Run: `npx tsc --noEmit -p .` и `npm test`
Expected: без ошибок, все тесты проходят.

### Task 4: Сборка, выкатка, проверка

- [ ] **Step 1:** `npm run build` — сборка без ошибок.
- [ ] **Step 2:** Коммит `feat: card predictions block on the fight prediction page` и push в master (автодеплой).
- [ ] **Step 3:** Дождаться перезапуска `fightbase.service` (ActiveEnterTimestamp позже пуша), затем во встроенном браузере на ширине 375 px открыть прогноз UFC 334 и прогноз UFC 333: блок есть, текущего боя в нём нет, главный бой первым, у UFC 333 итоги с ✓/✗.
