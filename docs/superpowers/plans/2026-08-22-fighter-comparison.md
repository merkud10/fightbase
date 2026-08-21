# Страницы сравнения бойцов — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Раздел `/ru/compare/<a>-vs-<b>` с таблицей характеристик двух бойцов; курируемый набор пар индексируется, остальные открываются с `noindex`.

**Architecture:** Чистая логика (канонизация слага пары, сравнение метрик, правило курирования) вынесена в модули без обращения к базе и покрыта юнит-тестами. Доступ к данным — в `lib/db/comparison.ts` поверх существующих `getUfcRankingSnapshot` и `getUfcOfficialRankingLinks`. Страница — ISR с `revalidate = 3600`, без `generateStaticParams`.

**Tech Stack:** Next.js 15 App Router, React 19 (серверные компоненты), Prisma 6 + Postgres, TypeScript, `node --test` + tsx.

**Спека:** `docs/superpowers/specs/2026-08-22-fighter-comparison-design.md`

---

## Структура файлов

| Файл | Ответственность |
|---|---|
| `lib/compare-pairs.ts` | Канонизация и разбор слага пары. Без базы. |
| `lib/compare-metrics.ts` | Описание строк таблицы и выбор лучшей стороны. Без базы. |
| `lib/compare-curation.ts` | Правило курирования из групп рейтинга и боёв. Без базы. |
| `lib/db/comparison.ts` | Выборки: данные страницы и курируемый набор. |
| `components/compare-table.tsx` | Отрисовка таблицы характеристик. |
| `app/compare/[pair]/page.tsx` | Страница сравнения: метаданные, редирект, JSON-LD. |
| `app/compare/(list)/page.tsx` | Хаб по дивизионам. |
| `tests/compare-pairs.test.ts` | Тесты канонизации. |
| `tests/compare-metrics.test.ts` | Тесты сравнения метрик. |
| `tests/compare-curation.test.ts` | Тесты правила курирования. |

Изменяются: `app/sitemap.ts`, `app/globals.css`, `app/fighters/[slug]/page.tsx`, `app/events/[slug]/page.tsx`, `app/predictions/[eventSlug]/[fightSlug]/page.tsx`, `components/header-navigation.tsx`, `lib/db/index.ts`.

### Два решения, не покрытых спекой явно

1. **Редирект отдаёт 308, а не 301.** В App Router `permanentRedirect()` возвращает 308. Настоящий 301 потребовал бы middleware, но там нет доступа к Prisma (edge runtime), а разбор неоднозначного слага требует базы. Для поисковиков 308 эквивалентен 301.
2. **Размах рук сравнивается, возраст и рост — нет.** Спека называет неcравниваемыми возраст и рост; размах она не упоминает. В ММА длина рук — реальное преимущество, поэтому подсвечиваем большее значение.

---

## Task 1: Канонизация слага пары

**Files:**
- Create: `lib/compare-pairs.ts`
- Test: `tests/compare-pairs.test.ts`

- [x] **Step 1: Написать падающий тест**

Создать `tests/compare-pairs.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";

import { buildPairSlug, isCanonicalPairOrder, splitPairSlugCandidates } from "../lib/compare-pairs";

test("buildPairSlug сортирует слаги лексикографически", () => {
  assert.equal(buildPairSlug("sean-omalley", "aljamain-sterling"), "aljamain-sterling-vs-sean-omalley");
  assert.equal(buildPairSlug("aljamain-sterling", "sean-omalley"), "aljamain-sterling-vs-sean-omalley");
});

// Тест-сторож: пара, различающаяся на дефисе, проверяет, что порядок задаётся
// именно побайтовым сравнением. Дефис ('-', 0x2D) меньше любой строчной буквы,
// поэтому o-malley < omalley и должен стоять первым.
test("buildPairSlug: дефис сортируется раньше буквы (побайтовое сравнение)", () => {
  assert.equal(buildPairSlug("omalley", "o-malley"), "o-malley-vs-omalley");
  assert.equal(buildPairSlug("o-malley", "omalley"), "o-malley-vs-omalley");
});

// Фиксируем поведение при одинаковых слагах: модуль намеренно не валидирует,
// что бойцы разные — это делает вызывающий код.
test("buildPairSlug при одинаковых слагах", () => {
  assert.equal(buildPairSlug("jon-jones", "jon-jones"), "jon-jones-vs-jon-jones");
});

test("isCanonicalPairOrder различает канонический и обратный порядок", () => {
  assert.equal(isCanonicalPairOrder("aljamain-sterling", "sean-omalley"), true);
  assert.equal(isCanonicalPairOrder("sean-omalley", "aljamain-sterling"), false);
});

test("isCanonicalPairOrder при одинаковых слагах возвращает true", () => {
  assert.equal(isCanonicalPairOrder("jon-jones", "jon-jones"), true);
});

test("splitPairSlugCandidates возвращает единственный разрез для обычного слага", () => {
  assert.deepEqual(splitPairSlugCandidates("aljamain-sterling-vs-sean-omalley"), [
    { a: "aljamain-sterling", b: "sean-omalley" }
  ]);
});

test("splitPairSlugCandidates перебирает все разрезы, если -vs- встречается несколько раз", () => {
  assert.deepEqual(splitPairSlugCandidates("a-vs-b-vs-c"), [
    { a: "a", b: "b-vs-c" },
    { a: "a-vs-b", b: "c" }
  ]);
});

test("splitPairSlugCandidates отвергает пути без разделителя и с пустой стороной", () => {
  assert.deepEqual(splitPairSlugCandidates("odinokiy-boec"), []);
  assert.deepEqual(splitPairSlugCandidates("-vs-sean-omalley"), []);
  assert.deepEqual(splitPairSlugCandidates("sean-omalley-vs-"), []);
});

// Нормализация регистра: URL может прийти в смешанном регистре,
// splitPairSlugCandidates обязана отдавать кандидатов в нижнем регистре.
test("splitPairSlugCandidates приводит входную строку к нижнему регистру", () => {
  assert.deepEqual(splitPairSlugCandidates("Jon-Jones-vs-Aljamain-Sterling"), [
    { a: "jon-jones", b: "aljamain-sterling" }
  ]);
  assert.deepEqual(splitPairSlugCandidates("SEAN-OMALLEY-VS-JON-JONES"), [
    { a: "sean-omalley", b: "jon-jones" }
  ]);
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `node --import tsx --test tests/compare-pairs.test.ts`
Expected: FAIL — `Cannot find module '../lib/compare-pairs'`

- [x] **Step 3: Написать минимальную реализацию**

Создать `lib/compare-pairs.ts`:

```typescript
export const PAIR_SEPARATOR = "-vs-";

// Тип кандидата разбора — экспортируется, чтобы вызывающий код не дублировал его.
export type PairSlugCandidate = { a: string; b: string };

export function buildPairSlug(slugA: string, slugB: string) {
  // Побайтовое сравнение операторами < / >: результат одинаков во всех сборках Node
  // независимо от версии ICU. localeCompare не подходит, потому что его результат
  // зависит от полноты ICU-данных в конкретном бинаре, а этот порядок запекается
  // в канонические URL и sitemap — смена порядка означала бы массовую переиндексацию.
  // Слаги содержат только [a-z0-9-], locale-sensitive collation тут не нужна.
  //
  // ВАЖНО: порядок нельзя менять. Он запечён в канонические URL и sitemap;
  // любое изменение = массовая переиндексация раздела сравнения.
  const [first, second] = [slugA, slugB].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  return `${first}${PAIR_SEPARATOR}${second}`;
}

export function isCanonicalPairOrder(slugA: string, slugB: string) {
  return buildPairSlug(slugA, slugB) === `${slugA}${PAIR_SEPARATOR}${slugB}`;
}

// Слаг бойца теоретически может содержать "-vs-", поэтому разрез неоднозначен.
// Возвращаем все варианты; правильный выбирает вызывающий код, сверяясь с базой.
//
// Входная строка приводится к нижнему регистру: URL может прийти в произвольном
// регистре, а лукап в базе — регистронезависим. Без нормализации страница открылась
// бы по двум адресам без редиректа, что создаёт ровно тот дубль, который раздел
// исключает. После нормализации сборка канонического слага из слагов базы (всегда
// нижний регистр) не совпадёт с исходным URL и вызовет корректный 308.
//
// Кандидаты упорядочены от самого короткого `a` к самому длинному:
// первый разрез всегда даёт наименьший `a` и наибольший `b`.
export function splitPairSlugCandidates(pairSlug: string): PairSlugCandidate[] {
  const normalized = pairSlug.toLowerCase();
  const candidates: PairSlugCandidate[] = [];
  let index = normalized.indexOf(PAIR_SEPARATOR);

  while (index !== -1) {
    const a = normalized.slice(0, index);
    const b = normalized.slice(index + PAIR_SEPARATOR.length);

    if (a && b) {
      candidates.push({ a, b });
    }

    index = normalized.indexOf(PAIR_SEPARATOR, index + 1);
  }

  return candidates;
}
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

Run: `node --import tsx --test tests/compare-pairs.test.ts`
Expected: PASS, 9 тестов

- [ ] **Step 5: Коммит**

```bash
git add lib/compare-pairs.ts tests/compare-pairs.test.ts
git commit -m "feat: канонизация слага пары для сравнения бойцов"
```

---

## Task 2: Сравнение метрик

**Files:**
- Create: `lib/compare-metrics.ts`
- Test: `tests/compare-metrics.test.ts`

- [ ] **Step 1: Написать падающий тест**

Создать `tests/compare-metrics.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";

import { COMPARE_METRICS, pickBetterSide } from "../lib/compare-metrics";

test("для обычной метрики лучше большее значение", () => {
  assert.equal(pickBetterSide({ direction: "higher" }, 3.5, 2.1), "a");
  assert.equal(pickBetterSide({ direction: "higher" }, 2.1, 3.5), "b");
});

test("SApM инвертирована: меньше пропущенных ударов лучше", () => {
  const sapm = COMPARE_METRICS.find((metric) => metric.key === "sigStrikesAbsorbedPerMin");
  assert.ok(sapm, "метрика SApM должна быть в списке");
  assert.equal(sapm.direction, "lower");
  assert.equal(pickBetterSide(sapm, 2.16, 4.02), "a");
  assert.equal(pickBetterSide(sapm, 4.02, 2.16), "b");
});

test("равные значения не дают подсветки", () => {
  assert.equal(pickBetterSide({ direction: "higher" }, 3, 3), null);
  assert.equal(pickBetterSide({ direction: "lower" }, 3, 3), null);
});

test("пропущенное значение у одной стороны снимает подсветку", () => {
  assert.equal(pickBetterSide({ direction: "higher" }, 3.5, null), null);
  assert.equal(pickBetterSide({ direction: "higher" }, null, 3.5), null);
  assert.equal(pickBetterSide({ direction: "higher" }, null, null), null);
});

test("нейтральные метрики не подсвечиваются никогда", () => {
  assert.equal(pickBetterSide({ direction: "neutral" }, 44, 33), null);
  const age = COMPARE_METRICS.find((metric) => metric.key === "age");
  assert.equal(age?.direction, "neutral");
  const height = COMPARE_METRICS.find((metric) => metric.key === "heightCm");
  assert.equal(height?.direction, "neutral");
});

test("размах рук сравнивается — большее значение преимущество", () => {
  const reach = COMPARE_METRICS.find((metric) => metric.key === "reachCm");
  assert.equal(reach?.direction, "higher");
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `node --import tsx --test tests/compare-metrics.test.ts`
Expected: FAIL — `Cannot find module '../lib/compare-metrics'`

- [ ] **Step 3: Написать минимальную реализацию**

Создать `lib/compare-metrics.ts`:

```typescript
import type { Locale } from "@/lib/locale-config";

export type CompareDirection = "higher" | "lower" | "neutral";

export type CompareMetric = {
  key: string;
  labelRu: string;
  labelEn: string;
  direction: CompareDirection;
  suffix?: string;
};

// direction: "higher" — больше лучше, "lower" — меньше лучше,
// "neutral" — показываем различие, но преимущества не присуждаем.
export const COMPARE_METRICS: CompareMetric[] = [
  { key: "age", labelRu: "Возраст", labelEn: "Age", direction: "neutral" },
  { key: "heightCm", labelRu: "Рост", labelEn: "Height", direction: "neutral", suffix: " см" },
  { key: "reachCm", labelRu: "Размах рук", labelEn: "Reach", direction: "higher", suffix: " см" },
  { key: "winsByKnockout", labelRu: "Побед KO/TKO", labelEn: "Wins by KO/TKO", direction: "higher" },
  { key: "winsBySubmission", labelRu: "Побед сабмишеном", labelEn: "Wins by submission", direction: "higher" },
  { key: "winsByDecision", labelRu: "Побед решением", labelEn: "Wins by decision", direction: "higher" },
  { key: "sigStrikesLandedPerMin", labelRu: "SLpM", labelEn: "SLpM", direction: "higher" },
  { key: "strikeAccuracy", labelRu: "Точность ударов", labelEn: "Strike accuracy", direction: "higher", suffix: "%" },
  { key: "sigStrikesAbsorbedPerMin", labelRu: "SApM", labelEn: "SApM", direction: "lower" },
  { key: "strikeDefense", labelRu: "Защита в стойке", labelEn: "Strike defense", direction: "higher", suffix: "%" },
  { key: "takedownAveragePer15", labelRu: "Тейкдауны / 15 мин", labelEn: "Takedowns / 15 min", direction: "higher" },
  { key: "takedownAccuracy", labelRu: "Точность тейкдаунов", labelEn: "Takedown accuracy", direction: "higher", suffix: "%" },
  { key: "takedownDefense", labelRu: "Защита от тейкдаунов", labelEn: "Takedown defense", direction: "higher", suffix: "%" },
  { key: "submissionAveragePer15", labelRu: "Сабмишены / 15 мин", labelEn: "Submissions / 15 min", direction: "higher" }
];

export function getMetricLabel(metric: CompareMetric, locale: Locale) {
  return locale === "ru" ? metric.labelRu : metric.labelEn;
}

export function pickBetterSide(
  metric: Pick<CompareMetric, "direction">,
  valueA: number | null | undefined,
  valueB: number | null | undefined
): "a" | "b" | null {
  if (metric.direction === "neutral") {
    return null;
  }

  if (typeof valueA !== "number" || typeof valueB !== "number") {
    return null;
  }

  if (valueA === valueB) {
    return null;
  }

  const aWins = metric.direction === "higher" ? valueA > valueB : valueA < valueB;

  return aWins ? "a" : "b";
}

export function formatMetricValue(metric: CompareMetric, value: number | null | undefined) {
  if (typeof value !== "number") {
    return "—";
  }

  return `${value}${metric.suffix ?? ""}`;
}
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

Run: `node --import tsx --test tests/compare-metrics.test.ts`
Expected: PASS, 6 тестов

- [ ] **Step 5: Коммит**

```bash
git add lib/compare-metrics.ts tests/compare-metrics.test.ts
git commit -m "feat: правила сравнения метрик бойцов"
```

---

## Task 3: Правило курирования

**Files:**
- Create: `lib/compare-curation.ts`
- Test: `tests/compare-curation.test.ts`

- [ ] **Step 1: Написать падающий тест**

Создать `tests/compare-curation.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";

import { buildCuratedPairs } from "../lib/compare-curation";

const GROUPS = [
  {
    title: "Легкий вес",
    champion: { name: "Islam Makhachev", officialSlug: "islam-makhachev", imageUrl: null },
    rows: [
      { rank: 1, name: "Arman Tsarukyan", officialSlug: "arman-tsarukyan", badge: null },
      { rank: 2, name: "Charles Oliveira", officialSlug: "charles-oliveira", badge: null }
    ]
  }
];

const RESOLVE = (name: string) => {
  const map: Record<string, string> = {
    "islam makhachev": "islam-makhachev",
    "arman tsarukyan": "arman-tsarukyan",
    "charles oliveira": "charles-oliveira"
  };

  return map[name.toLowerCase()] ?? null;
};

test("ранкед-бойцы дивизиона дают все попарные комбинации", () => {
  const pairs = buildCuratedPairs({ groups: GROUPS, fightPairs: [], resolveSlug: RESOLVE });
  const slugs = pairs.map((pair) => pair.pairSlug).sort();

  assert.deepEqual(slugs, [
    "arman-tsarukyan-vs-charles-oliveira",
    "arman-tsarukyan-vs-islam-makhachev",
    "charles-oliveira-vs-islam-makhachev"
  ]);
});

test("боец без локального профиля выпадает из набора", () => {
  const resolve = (name: string) => (name === "Charles Oliveira" ? null : RESOLVE(name));
  const pairs = buildCuratedPairs({ groups: GROUPS, fightPairs: [], resolveSlug: resolve });

  assert.deepEqual(pairs.map((pair) => pair.pairSlug), ["arman-tsarukyan-vs-islam-makhachev"]);
});

test("дубли со слагом вида -\\d+$ отсеиваются", () => {
  const resolve = (name: string) => (name === "Charles Oliveira" ? "charles-oliveira-2" : RESOLVE(name));
  const pairs = buildCuratedPairs({ groups: GROUPS, fightPairs: [], resolveSlug: resolve });

  assert.deepEqual(pairs.map((pair) => pair.pairSlug), ["arman-tsarukyan-vs-islam-makhachev"]);
});

test("пары из боёв попадают в набор и помечаются hasFight", () => {
  const pairs = buildCuratedPairs({
    groups: [],
    fightPairs: [{ slugA: "sean-omalley", slugB: "aljamain-sterling", isScheduled: true }],
    resolveSlug: RESOLVE
  });

  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].pairSlug, "aljamain-sterling-vs-sean-omalley");
  assert.equal(pairs[0].hasFight, true);
  assert.equal(pairs[0].isScheduled, true);
});

test("пара из боя и из рейтинга не дублируется, флаг боя сохраняется", () => {
  const pairs = buildCuratedPairs({
    groups: GROUPS,
    fightPairs: [{ slugA: "islam-makhachev", slugB: "arman-tsarukyan", isScheduled: true }],
    resolveSlug: RESOLVE
  });

  const target = pairs.filter((pair) => pair.pairSlug === "arman-tsarukyan-vs-islam-makhachev");
  assert.equal(target.length, 1);
  assert.equal(target[0].hasFight, true);
  assert.equal(target[0].isScheduled, true);
});

test("при пустом снимке рейтинга набор сводится к парам из боёв", () => {
  const pairs = buildCuratedPairs({
    groups: [],
    fightPairs: [{ slugA: "sean-omalley", slugB: "aljamain-sterling", isScheduled: false }],
    resolveSlug: RESOLVE
  });

  assert.deepEqual(pairs.map((pair) => pair.pairSlug), ["aljamain-sterling-vs-sean-omalley"]);
});

test("боец сам с собой в набор не попадает", () => {
  const pairs = buildCuratedPairs({
    groups: [],
    fightPairs: [{ slugA: "sean-omalley", slugB: "sean-omalley", isScheduled: false }],
    resolveSlug: RESOLVE
  });

  assert.deepEqual(pairs, []);
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `node --import tsx --test tests/compare-curation.test.ts`
Expected: FAIL — `Cannot find module '../lib/compare-curation'`

- [ ] **Step 3: Написать минимальную реализацию**

Создать `lib/compare-curation.ts`:

```typescript
import type { UfcOfficialRankingGroup } from "@/lib/ufc-rankings";
import { buildPairSlug } from "@/lib/compare-pairs";
import { looksLikeLowQualitySlug } from "@/lib/sitemap-entries";

export type CuratedPair = {
  pairSlug: string;
  slugA: string;
  slugB: string;
  weightClass: string | null;
  hasFight: boolean;
  isScheduled: boolean;
};

export type FightPairInput = {
  slugA: string;
  slugB: string;
  isScheduled: boolean;
};

type BuildCuratedPairsInput = {
  groups: UfcOfficialRankingGroup[];
  fightPairs: FightPairInput[];
  resolveSlug: (name: string) => string | null;
};

function isUsableSlug(slug: string | null): slug is string {
  return Boolean(slug) && !looksLikeLowQualitySlug(slug as string);
}

export function buildCuratedPairs({ groups, fightPairs, resolveSlug }: BuildCuratedPairsInput): CuratedPair[] {
  const byPairSlug = new Map<string, CuratedPair>();

  const add = (slugA: string, slugB: string, weightClass: string | null, fight: FightPairInput | null) => {
    if (slugA === slugB) {
      return;
    }

    const pairSlug = buildPairSlug(slugA, slugB);
    const [first, second] = [slugA, slugB].sort((a, b) => a.localeCompare(b, "en"));
    const existing = byPairSlug.get(pairSlug);

    if (existing) {
      // Пара может прийти и из рейтинга, и из боя — флаги боя не теряем.
      existing.hasFight = existing.hasFight || Boolean(fight);
      existing.isScheduled = existing.isScheduled || Boolean(fight?.isScheduled);
      existing.weightClass = existing.weightClass ?? weightClass;
      return;
    }

    byPairSlug.set(pairSlug, {
      pairSlug,
      slugA: first,
      slugB: second,
      weightClass,
      hasFight: Boolean(fight),
      isScheduled: Boolean(fight?.isScheduled)
    });
  };

  for (const group of groups) {
    const slugs = [group.champion.name, ...group.rows.map((row) => row.name)]
      .map((name) => resolveSlug(name))
      .filter(isUsableSlug);
    const unique = [...new Set(slugs)];

    for (let i = 0; i < unique.length; i += 1) {
      for (let j = i + 1; j < unique.length; j += 1) {
        add(unique[i], unique[j], group.title, null);
      }
    }
  }

  for (const fight of fightPairs) {
    if (!isUsableSlug(fight.slugA) || !isUsableSlug(fight.slugB)) {
      continue;
    }

    add(fight.slugA, fight.slugB, null, fight);
  }

  return [...byPairSlug.values()];
}
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

Run: `node --import tsx --test tests/compare-curation.test.ts`
Expected: PASS, 7 тестов

- [ ] **Step 5: Прогнать весь набор и проверить типы**

Run: `npm test && npm run typecheck`
Expected: все тесты зелёные, typecheck без ошибок

- [ ] **Step 6: Коммит**

```bash
git add lib/compare-curation.ts tests/compare-curation.test.ts
git commit -m "feat: правило курирования пар для сравнения"
```

---

## Task 4: Выборки из базы

**Files:**
- Create: `lib/db/comparison.ts`
- Modify: `lib/db/index.ts`

- [ ] **Step 1: Написать модуль выборок**

Создать `lib/db/comparison.ts`:

```typescript
import type { Prisma } from "@prisma/client";
import { cache } from "react";

import { buildCuratedPairs, type CuratedPair, type FightPairInput } from "@/lib/compare-curation";
import { splitPairSlugCandidates } from "@/lib/compare-pairs";
import { prisma } from "@/lib/prisma";
import { getUfcOfficialRankingLinks } from "./fighters";
import { getUfcRankingSnapshot } from "./rankings";

const comparisonFighterSelect = {
  id: true,
  slug: true,
  name: true,
  nameRu: true,
  nickname: true,
  photoUrl: true,
  record: true,
  weightClass: true,
  status: true,
  country: true,
  team: true,
  style: true,
  age: true,
  heightCm: true,
  reachCm: true,
  winsByKnockout: true,
  winsBySubmission: true,
  winsByDecision: true,
  sigStrikesLandedPerMin: true,
  strikeAccuracy: true,
  sigStrikesAbsorbedPerMin: true,
  strikeDefense: true,
  takedownAveragePer15: true,
  takedownAccuracy: true,
  takedownDefense: true,
  submissionAveragePer15: true,
  averageFightTime: true,
  promotion: {
    select: {
      slug: true,
      shortName: true
    }
  }
} satisfies Prisma.FighterSelect;

export type ComparisonFighter = Prisma.FighterGetPayload<{
  select: typeof comparisonFighterSelect;
}>;

export type ComparisonPageData = {
  fighterA: ComparisonFighter;
  fighterB: ComparisonFighter;
  headToHead: {
    eventSlug: string | null;
    eventName: string;
    date: Date | null;
    winnerFighterId: string | null;
    method: string | null;
    status: string;
  }[];
};

// Слаг пары может резаться неоднозначно, поэтому перебираем варианты
// и берём тот, где оба слага действительно есть в базе.
export const getComparisonPageData = cache(async function getComparisonPageData(
  pairSlug: string
): Promise<ComparisonPageData | null> {
  const candidates = splitPairSlugCandidates(pairSlug);

  for (const candidate of candidates) {
    if (candidate.a === candidate.b) {
      continue;
    }

    const fighters = await prisma.fighter.findMany({
      where: { slug: { in: [candidate.a, candidate.b] } },
      select: comparisonFighterSelect
    });

    if (fighters.length !== 2) {
      continue;
    }

    const fighterA = fighters.find((fighter) => fighter.slug === candidate.a);
    const fighterB = fighters.find((fighter) => fighter.slug === candidate.b);

    if (!fighterA || !fighterB) {
      continue;
    }

    const fights = await prisma.fight.findMany({
      where: {
        OR: [
          { fighterAId: fighterA.id, fighterBId: fighterB.id },
          { fighterAId: fighterB.id, fighterBId: fighterA.id }
        ]
      },
      select: {
        status: true,
        method: true,
        winnerFighterId: true,
        event: {
          select: {
            slug: true,
            name: true,
            startsAt: true
          }
        }
      },
      orderBy: { updatedAt: "desc" }
    });

    return {
      fighterA,
      fighterB,
      headToHead: fights.map((fight) => ({
        eventSlug: fight.event?.slug ?? null,
        eventName: fight.event?.name ?? "",
        date: fight.event?.startsAt ?? null,
        winnerFighterId: fight.winnerFighterId,
        method: fight.method,
        status: fight.status
      }))
    };
  }

  return null;
});

export const getCuratedComparisonPairs = cache(async function getCuratedComparisonPairs(): Promise<CuratedPair[]> {
  const [snapshot, links, fights] = await Promise.all([
    getUfcRankingSnapshot(),
    getUfcOfficialRankingLinks(),
    prisma.fight.findMany({
      select: {
        status: true,
        fighterA: { select: { slug: true } },
        fighterB: { select: { slug: true } }
      }
    })
  ]);

  const fightPairs: FightPairInput[] = fights
    .filter((fight) => fight.fighterA?.slug && fight.fighterB?.slug)
    .map((fight) => ({
      slugA: fight.fighterA.slug,
      slugB: fight.fighterB.slug,
      isScheduled: fight.status === "scheduled"
    }));

  return buildCuratedPairs({
    groups: snapshot?.groups ?? [],
    fightPairs,
    resolveSlug: (name) => links.byName.get(name.toLowerCase())?.localSlug ?? null
  });
});
```

- [ ] **Step 2: Подключить модуль к бочке экспортов**

В `lib/db/index.ts` добавить строку после `export * from "./articles";`:

```typescript
export * from "./comparison";
```

- [ ] **Step 3: Проверить типы**

Run: `npm run typecheck`
Expected: без ошибок

Если `startsAt` не то имя поля даты в модели `Event` — открыть `prisma/schema.postgres.prisma`, найти модель `Event`, подставить фактическое имя и повторить.

- [ ] **Step 4: Коммит**

```bash
git add lib/db/comparison.ts lib/db/index.ts
git commit -m "feat: выборки данных для сравнения бойцов"
```

---

## Task 5: Компонент таблицы

**Files:**
- Create: `components/compare-table.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Написать компонент**

Создать `components/compare-table.tsx`:

```tsx
import {
  COMPARE_METRICS,
  formatMetricValue,
  getMetricLabel,
  pickBetterSide
} from "@/lib/compare-metrics";
import type { ComparisonFighter } from "@/lib/db/comparison";
import { getDisplayName } from "@/lib/display";
import type { Locale } from "@/lib/locale-config";

type CompareTableProps = {
  fighterA: ComparisonFighter;
  fighterB: ComparisonFighter;
  locale: Locale;
};

function readMetric(fighter: ComparisonFighter, key: string) {
  const value = (fighter as unknown as Record<string, unknown>)[key];

  return typeof value === "number" ? value : null;
}

export function CompareTable({ fighterA, fighterB, locale }: CompareTableProps) {
  const nameA = getDisplayName(fighterA, locale);
  const nameB = getDisplayName(fighterB, locale);
  const rows = COMPARE_METRICS.map((metric) => {
    const valueA = readMetric(fighterA, metric.key);
    const valueB = readMetric(fighterB, metric.key);

    return { metric, valueA, valueB, better: pickBetterSide(metric, valueA, valueB) };
  }).filter((row) => row.valueA !== null || row.valueB !== null);

  return (
    <div className="table-card compare-table">
      <div className="compare-row compare-row-head">
        <span className="compare-side">{nameA}</span>
        <span className="compare-label" aria-hidden="true" />
        <span className="compare-side">{nameB}</span>
      </div>

      <div className="compare-row">
        <span className="compare-side">{fighterA.record || "—"}</span>
        <span className="compare-label">{locale === "ru" ? "Рекорд" : "Record"}</span>
        <span className="compare-side">{fighterB.record || "—"}</span>
      </div>

      {rows.map(({ metric, valueA, valueB, better }) => (
        <div className="compare-row" key={metric.key}>
          <span className={better === "a" ? "compare-side is-better" : "compare-side"}>
            {formatMetricValue(metric, valueA)}
          </span>
          <span className="compare-label">{getMetricLabel(metric, locale)}</span>
          <span className={better === "b" ? "compare-side is-better" : "compare-side"}>
            {formatMetricValue(metric, valueB)}
          </span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Добавить стили**

В конец `app/globals.css` добавить:

```css
/* ── COMPARE ── */

.compare-table {
  display: grid;
  gap: 2px;
  padding: 18px;
}

.compare-row {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--line);
}

.compare-row:last-child {
  border-bottom: none;
}

.compare-row-head {
  font-family: var(--font-heading), sans-serif;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.compare-side {
  font-variant-numeric: tabular-nums;
}

.compare-side:first-child {
  text-align: right;
}

.compare-side:last-child {
  text-align: left;
}

.compare-side.is-better {
  color: var(--red);
  font-weight: 700;
}

.compare-label {
  color: var(--muted);
  font-size: 13px;
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

@media (max-width: 560px) {
  .compare-row {
    grid-template-columns: 1fr auto 1fr;
    gap: 8px;
  }

  .compare-label {
    font-size: 11px;
  }
}
```

- [ ] **Step 3: Проверить типы**

Run: `npm run typecheck`
Expected: без ошибок

- [ ] **Step 4: Коммит**

```bash
git add components/compare-table.tsx app/globals.css
git commit -m "feat: таблица сравнения характеристик бойцов"
```

---

## Task 6: Страница сравнения

**Files:**
- Create: `app/compare/[pair]/page.tsx`

- [ ] **Step 1: Написать страницу**

Создать `app/compare/[pair]/page.tsx`:

```tsx
import { notFound, permanentRedirect } from "next/navigation";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { CompareTable } from "@/components/compare-table";
import { JsonLd } from "@/components/json-ld";
import { PageHero } from "@/components/page-hero";
import { buildPairSlug } from "@/lib/compare-pairs";
import { getComparisonPageData, getCuratedComparisonPairs } from "@/lib/db/comparison";
import { formatWeightClass, getDisplayName } from "@/lib/display";
import { getLocale } from "@/lib/i18n";
import { localizePath } from "@/lib/locale-path";
import { buildPageMetadata } from "@/lib/page-metadata";
import { getSiteUrl } from "@/lib/site";

export const revalidate = 3600;

type PageProps = {
  params: Promise<{ pair: string }>;
};

async function isCurated(pairSlug: string) {
  const pairs = await getCuratedComparisonPairs();

  return pairs.some((pair) => pair.pairSlug === pairSlug);
}

export async function generateMetadata({ params }: PageProps) {
  const { pair } = await params;
  const data = await getComparisonPageData(pair);

  if (!data) {
    notFound();
  }

  const locale = await getLocale();
  const nameA = getDisplayName(data.fighterA, locale);
  const nameB = getDisplayName(data.fighterB, locale);
  const canonicalPair = buildPairSlug(data.fighterA.slug, data.fighterB.slug);
  const title =
    locale === "ru"
      ? `${nameA} против ${nameB}: сравнение бойцов UFC`
      : `${nameA} vs ${nameB}: UFC fighter comparison`;
  const description =
    locale === "ru"
      ? `Сравнение ${nameA} и ${nameB}: рекорд, физические данные и официальная статистика UFC.`
      : `Compare ${nameA} and ${nameB}: records, physicals and official UFC statistics.`;

  const metadata = buildPageMetadata({
    locale,
    path: `/compare/${canonicalPair}`,
    title,
    description
  });

  if (await isCurated(canonicalPair)) {
    return metadata;
  }

  // Произвольные пары остаются доступными людям, но не индексируются.
  return { ...metadata, robots: { index: false, follow: true } };
}

export default async function ComparePage({ params }: PageProps) {
  const { pair } = await params;
  const data = await getComparisonPageData(pair);

  if (!data) {
    notFound();
  }

  const locale = await getLocale();
  const canonicalPair = buildPairSlug(data.fighterA.slug, data.fighterB.slug);

  if (canonicalPair !== pair) {
    permanentRedirect(localizePath(`/compare/${canonicalPair}`, locale));
  }

  const nameA = getDisplayName(data.fighterA, locale);
  const nameB = getDisplayName(data.fighterB, locale);
  const origin = getSiteUrl().toString().replace(/\/$/, "");
  const pagePath = localizePath(`/compare/${canonicalPair}`, locale);

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "FightBase Media", item: `${origin}${localizePath("/", locale)}` },
            {
              "@type": "ListItem",
              position: 2,
              name: locale === "ru" ? "Сравнение" : "Compare",
              item: `${origin}${localizePath("/compare", locale)}`
            },
            { "@type": "ListItem", position: 3, name: `${nameA} — ${nameB}`, item: `${origin}${pagePath}` }
          ]
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Person",
          name: nameA,
          url: `${origin}${localizePath(`/fighters/${data.fighterA.slug}`, locale)}`
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Person",
          name: nameB,
          url: `${origin}${localizePath(`/fighters/${data.fighterB.slug}`, locale)}`
        }}
      />

      <Breadcrumbs
        items={[
          { label: locale === "ru" ? "Главная" : "Home", href: localizePath("/", locale) },
          { label: locale === "ru" ? "Сравнение" : "Compare", href: localizePath("/compare", locale) },
          { label: `${nameA} — ${nameB}` }
        ]}
      />

      <PageHero
        eyebrow={formatWeightClass(data.fighterA.weightClass, locale)}
        title={`${nameA} ${locale === "ru" ? "против" : "vs"} ${nameB}`}
        description={`${data.fighterA.record || "—"} · ${data.fighterB.record || "—"}`}
      />

      {data.headToHead.length ? (
        <section className="policy-card">
          <h3>{locale === "ru" ? "Очные встречи" : "Head to head"}</h3>
          <ul>
            {data.headToHead.map((fight, index) => (
              <li key={`${fight.eventSlug ?? "fight"}-${index}`} className="copy">
                {fight.eventName}
                {fight.method ? ` — ${fight.method}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <CompareTable fighterA={data.fighterA} fighterB={data.fighterB} locale={locale} />
    </>
  );
}
```

- [ ] **Step 2: Сверить пропсы Breadcrumbs и PageHero с фактическими**

Открыть `components/breadcrumbs.tsx` и `components/page-hero.tsx`, сравнить имена пропсов с использованными выше. Если отличаются — исправить вызовы в странице под фактический интерфейс.

- [ ] **Step 3: Проверить типы**

Run: `npm run typecheck`
Expected: без ошибок

- [ ] **Step 4: Проверить страницу вживую**

Run: `npm run dev`

Открыть `http://localhost:3000/ru/compare/islam-makhachev-vs-arman-tsarukyan` (подставить два слага, реально существующих в локальной базе — взять из `/ru/fighters`).

Ожидается: страница с таблицей, подсветкой лучших значений, статус 200.

Затем открыть тот же URL с обратным порядком слагов. Ожидается: 308 на канонический порядок.

- [ ] **Step 5: Коммит**

```bash
git add app/compare/[pair]/page.tsx
git commit -m "feat: страница сравнения двух бойцов"
```

---

## Task 7: Хаб раздела

**Files:**
- Create: `app/compare/(list)/page.tsx`

- [ ] **Step 1: Написать хаб**

Создать `app/compare/(list)/page.tsx`:

```tsx
import Link from "next/link";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { PageHero } from "@/components/page-hero";
import { getCuratedComparisonPairs } from "@/lib/db/comparison";
import { getLocale } from "@/lib/i18n";
import { localizePath } from "@/lib/locale-path";
import { buildPageMetadata } from "@/lib/page-metadata";

export const revalidate = 3600;

export async function generateMetadata() {
  const locale = await getLocale();

  return buildPageMetadata({
    locale,
    path: "/compare",
    title: locale === "ru" ? "Сравнение бойцов UFC" : "UFC fighter comparison",
    description:
      locale === "ru"
        ? "Сравнение бойцов UFC по рекорду, физическим данным и официальной статистике."
        : "Compare UFC fighters by record, physicals and official statistics."
  });
}

export default async function CompareHubPage() {
  const locale = await getLocale();
  const pairs = await getCuratedComparisonPairs();
  const byDivision = new Map<string, typeof pairs>();

  for (const pair of pairs) {
    const key = pair.weightClass ?? (locale === "ru" ? "Состоявшиеся бои" : "Booked fights");
    const list = byDivision.get(key) ?? [];
    list.push(pair);
    byDivision.set(key, list);
  }

  return (
    <>
      <Breadcrumbs
        items={[
          { label: locale === "ru" ? "Главная" : "Home", href: localizePath("/", locale) },
          { label: locale === "ru" ? "Сравнение" : "Compare" }
        ]}
      />

      <PageHero
        title={locale === "ru" ? "Сравнение бойцов" : "Fighter comparison"}
        description={
          locale === "ru"
            ? "Рекорд, физические данные и официальная статистика UFC — двое бойцов рядом."
            : "Records, physicals and official UFC statistics side by side."
        }
      />

      {[...byDivision.entries()].map(([division, list]) => (
        <section className="policy-card" key={division}>
          <h3>{division}</h3>
          <ul>
            {list.map((pair) => (
              <li key={pair.pairSlug} className="copy">
                <Link href={localizePath(`/compare/${pair.pairSlug}`, locale)}>
                  {pair.slugA} — {pair.slugB}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
```

- [ ] **Step 2: Проверить типы и открыть страницу**

Run: `npm run typecheck`, затем открыть `http://localhost:3000/ru/compare`
Expected: список пар, сгруппированный по дивизионам

- [ ] **Step 3: Коммит**

```bash
git add "app/compare/(list)/page.tsx"
git commit -m "feat: хаб раздела сравнения бойцов"
```

---

## Task 8: Курируемые пары в sitemap

**Files:**
- Modify: `app/sitemap.ts`

- [ ] **Step 1: Подключить набор к карте сайта**

В `app/sitemap.ts` добавить импорт рядом с существующими:

```typescript
import { getCuratedComparisonPairs } from "@/lib/db/comparison";
```

Добавить `getCuratedComparisonPairs()` последним элементом в существующий `Promise.all` и принять его в деструктуризацию:

```typescript
const [articles, events, fighters, predictionSnapshots, quotes, comparisonPairs] = await Promise.all([
```

Добавить в возвращаемый массив после блока бойцов:

```typescript
    ...comparisonPairs.map((pair) => ({
      url: `${siteUrl}/ru/compare/${pair.pairSlug}`,
      changeFrequency: pair.isScheduled ? ("weekly" as const) : ("monthly" as const),
      priority: 0.6
    })),
```

Добавить `/compare` в массив `staticRoutes` после `"/rankings"`.

- [ ] **Step 2: Проверить типы и содержимое карты**

Run: `npm run typecheck`, затем `npm run dev` и `curl -s http://localhost:3000/sitemap.xml | grep -c "/ru/compare/"`
Expected: число больше нуля, равное размеру курируемого набора

- [ ] **Step 3: Прогнать тесты**

Run: `npm test`
Expected: все зелёные

- [ ] **Step 4: Коммит**

```bash
git add app/sitemap.ts
git commit -m "feat: курируемые пары сравнения в sitemap"
```

---

## Task 9: Точки входа

**Files:**
- Modify: `components/header-navigation.tsx`
- Modify: `app/fighters/[slug]/page.tsx`
- Modify: `app/events/[slug]/page.tsx`
- Modify: `app/predictions/[eventSlug]/[fightSlug]/page.tsx`

- [ ] **Step 1: Добавить пункт меню**

Открыть `components/header-navigation.tsx`, найти массив пунктов навигации и добавить пункт «Сравнение» / «Compare» со ссылкой `/compare` после «Рейтинги». Точную форму записи скопировать у соседнего пункта — структура массива уже задана в файле.

Проверить `tests/navigation.test.ts`: если он фиксирует список пунктов, обновить ожидания в тесте.

- [ ] **Step 2: Блок «Сравнить с» в профиле бойца**

В `app/fighters/[slug]/page.tsx` в правой колонке (`<aside className="stack">`, рядом с блоком статистики) добавить:

```tsx
{comparePairs.length ? (
  <div className="policy-card">
    <h3>{locale === "ru" ? "Сравнить с" : "Compare with"}</h3>
    <ul>
      {comparePairs.map((pair) => (
        <li key={pair.pairSlug} className="copy">
          <Link href={localizePath(`/compare/${pair.pairSlug}`, locale)}>
            {pair.slugA === fighter.slug ? pair.slugB : pair.slugA}
          </Link>
        </li>
      ))}
    </ul>
  </div>
) : null}
```

Выше в компоненте получить набор — только курируемые пары этого бойца, максимум шесть:

```tsx
const curated = await getCuratedComparisonPairs();
const comparePairs = curated
  .filter((pair) => pair.slugA === fighter.slug || pair.slugB === fighter.slug)
  .slice(0, 6);
```

Импортировать `getCuratedComparisonPairs` из `@/lib/db/comparison` и `localizePath` из `@/lib/locale-path`, если их ещё нет в импортах файла.

Блок не выводится, когда курируемых пар нет — это и есть требование спеки.

- [ ] **Step 3: Кнопка на странице турнира**

В `app/events/[slug]/page.tsx` найти отрисовку боёв карда. Для каждого боя, где известны слаги обоих участников, добавить ссылку рядом с существующей ссылкой на прогноз:

```tsx
<Link href={localizePath(`/compare/${buildPairSlug(fight.fighterA.slug, fight.fighterB.slug)}`, locale)}>
  {locale === "ru" ? "Сравнить бойцов" : "Compare fighters"}
</Link>
```

Импортировать `buildPairSlug` из `@/lib/compare-pairs`.

- [ ] **Step 4: Кнопка на странице прогноза**

Аналогично в `app/predictions/[eventSlug]/[fightSlug]/page.tsx` добавить ту же ссылку рядом с заголовком боя, используя слаги обоих бойцов и `buildPairSlug`.

- [ ] **Step 5: Проверить типы и тесты**

Run: `npm run typecheck && npm test`
Expected: без ошибок, все тесты зелёные

- [ ] **Step 6: Проверить вживую**

Run: `npm run dev`

Открыть профиль ранкед-бойца — блок «Сравнить с» на месте, ссылки ведут на рабочие страницы. Открыть профиль неранкед-бойца без записанных боёв — блока нет. Открыть страницу турнира и прогноза — кнопка сравнения ведёт на каноничный URL.

- [ ] **Step 7: Коммит**

```bash
git add components/header-navigation.tsx "app/fighters/[slug]/page.tsx" "app/events/[slug]/page.tsx" "app/predictions/[eventSlug]/[fightSlug]/page.tsx" tests/navigation.test.ts
git commit -m "feat: точки входа в раздел сравнения бойцов"
```

---

## Task 10: Итоговая проверка

- [ ] **Step 1: Полный прогон**

Run: `npm test && npm run typecheck`
Expected: всё зелёное

- [ ] **Step 2: Проверить поведение краевых случаев**

При запущенном `npm run dev` проверить и зафиксировать фактические коды ответа:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/ru/compare/nesushchestvuyushchiy-vs-sean-omalley"   # ожидается 404
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/ru/compare/sean-omalley-vs-sean-omalley"              # ожидается 404
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/ru/compare/bez-razdelitelya"                          # ожидается 404
```

Проверить, что некурируемая пара двух реальных бойцов отдаёт 200 и содержит `noindex`:

```bash
curl -s "http://localhost:3000/ru/compare/<боец-из-разных-дивизионов>" | grep -c noindex   # ожидается 1
```

- [ ] **Step 3: Проверить карту сайта**

```bash
curl -s http://localhost:3000/sitemap.xml | grep -c "/ru/compare/"
```

Ожидается: размер курируемого набора плюс единица за статический `/ru/compare`.

- [ ] **Step 4: Финальный коммит и пуш**

```bash
git add -A
git commit -m "feat: раздел сравнения бойцов"
git push origin master
```

После деплоя проверить на проде: `https://fightbase.ru/ru/compare`, одну курируемую пару и наличие пар в `https://fightbase.ru/sitemap.xml`.

---

## Самопроверка плана

**Покрытие спеки:**

| Требование спеки | Задача |
|---|---|
| Курируемый набор: ранкед-пары + бои | Task 3, Task 4 |
| Рейтинг из сохранённого снимка | Task 4 (`getUfcRankingSnapshot`) |
| Деградация до пар из `Fight` при пустом снимке | Task 3, тест «при пустом снимке рейтинга» |
| Фильтр дублей через `looksLikeLowQualitySlug` | Task 3, тест «дубли со слагом вида -\d+$» |
| Лексикографическая канонизация + редирект | Task 1, Task 6 |
| Разбор пути с несколькими `-vs-` | Task 1, Task 4 |
| 404 на несуществующий слаг / бойца с самим собой | Task 6, Task 10 |
| `revalidate = 3600`, без `generateStaticParams` | Task 6 |
| Хаб по дивизионам | Task 7 |
| Таблица, скрытие пустых строк, «—» | Task 5 |
| SApM инвертирована | Task 2, отдельный тест |
| Возраст и рост нейтральны | Task 2, отдельный тест |
| `buildPageMetadata`, BreadcrumbList + два Person | Task 6 |
| Курируемые пары в sitemap | Task 8 |
| `noindex, follow` для остальных | Task 6, Task 10 |
| Точки входа: бой, прогноз, профиль, меню | Task 9 |
| Блок в профиле скрыт без курируемых пар | Task 9, Step 2 |

Пробелов нет.

**Согласованность имён:** `buildPairSlug`, `splitPairSlugCandidates`, `pickBetterSide`, `COMPARE_METRICS`, `buildCuratedPairs`, `getComparisonPageData`, `getCuratedComparisonPairs`, `CuratedPair.pairSlug` — используются одинаково во всех задачах.

**Известные места сверки с кодом:** имя поля даты в модели `Event` (Task 4, Step 3), пропсы `Breadcrumbs` и `PageHero` (Task 6, Step 2), форма массива пунктов меню (Task 9, Step 1). В каждом случае шаг предписывает открыть файл и подставить фактическое, а не угадывать.
