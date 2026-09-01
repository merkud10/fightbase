# Резолв английских слагов UFC для рейтингов — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Строки рейтинга UFC должны находить профили бойцов в базе — вместо 124 надписей «Ожидается» на `/ru/rankings` должны остаться единицы.

**Architecture:** UFC.com редиректит российский IP сервера на `ufc.ru`, откуда приходят русские слаги (`dzhastin-getzhi`), не совпадающие с английскими слагами в базе (`justin-gaethje`). Страница атлета на ufc.ru отдаёт английский слаг в `<link rel="alternate" hreflang="en">`. При обновлении снимка резолвим русские слаги в английские через этот тег, кэшируем соответствия в таблице `UfcAthleteSlugAlias` и пишем в снимок уже английские слаги. Страница рейтингов и `getUfcOfficialRankingLinks` не меняются — они уже матчат по английскому слагу.

**Tech Stack:** Next.js, Prisma (две схемы: sqlite для локали/CI, postgres для прода), тесты `node:test` + `tsx`, скрипты на CommonJS в `scripts/`.

**Спека:** `docs/superpowers/specs/2026-09-01-ranking-slug-resolution-design.md`

**Ветка:** `fix/ranking-slug-resolution` (уже создана, спека закоммичена)

---

## Критично: user-agent

UFC.com за Cloudflare ведёт себя контринтуитивно. Проверено с прод-сервера:

- `user-agent: Mozilla/5.0 FightBase/1.0` → **200 OK**
- `user-agent: Mozilla/5.0 (Windows NT 10.0…) Chrome/120…` → **403**

Существующий `lib/ufc-rankings.ts` уже использует `Mozilla/5.0 FightBase/1.0`. **Не менять этот заголовок и не «улучшать» его на реалистичный браузерный** — сломается всё.

## Структура файлов

| Файл | Ответственность |
| --- | --- |
| `lib/ufc-athlete-slug.ts` | Создать. Чистая логика: разбор `hreflang`, оркестрация резолва с бюджетом, подстановка слагов в группы. Без Prisma и без сети. |
| `lib/db/ufc-athlete-slugs.ts` | Создать. Тонкий слой: чтение и запись таблицы алиасов, реальный фетчер. |
| `prisma/schema.prisma` | Изменить. Модель `UfcAthleteSlugAlias`. |
| `prisma/schema.postgres.prisma` | Изменить. Та же модель. |
| `prisma/migrations/20260901120000_add_ufc_athlete_slug_alias/migration.sql` | Создать. |
| `lib/db/rankings.ts` | Изменить `refreshUfcRankingSnapshot` (строки 23–63): вставить резолв между загрузкой и планированием. |
| `lib/db/index.ts` | Изменить. Реэкспорт нового модуля. |
| `scripts/backfill-ufc-slug-aliases.js` | Создать. Прогрев кэша напрямую через Prisma. |
| `package.json` | Изменить. Скрипт `content:backfill-slug-aliases`. |
| `tests/ufc-athlete-slug.test.ts` | Создать. Тесты чистой логики. |
| `tests/ufc-ranking-snapshot.test.ts` | Не трогать — существующие тесты должны остаться зелёными. |

Разделение «чистый модуль плюс тонкий слой БД» повторяет существующую пару `lib/ufc-ranking-snapshot.ts` и `lib/db/rankings.ts`. Благодаря ему вся логика тестируется без базы и без сети.

---

### Task 1: Модель `UfcAthleteSlugAlias`

**Files:**
- Modify: `prisma/schema.prisma` (после `model UfcRankingSnapshot`, строка 498)
- Modify: `prisma/schema.postgres.prisma` (после `model UfcRankingSnapshot`, строка 500)
- Create: `prisma/migrations/20260901120000_add_ufc_athlete_slug_alias/migration.sql`

- [ ] **Step 1: Добавить модель в обе схемы**

Одинаковый блок дописать в конец `prisma/schema.prisma` и `prisma/schema.postgres.prisma`:

```prisma
// Соответствие русского слага с ufc.ru английскому слагу с ufc.com. UFC.com
// редиректит российские IP на ufc.ru, где у атлетов свои транслитерированные
// слаги (иногда переиспользованные от других бойцов). Соответствие неизменно,
// поэтому TTL не нужен: в сеть ходим только за незнакомыми слагами.
model UfcAthleteSlugAlias {
  officialSlug String   @id
  englishSlug  String
  resolvedAt   DateTime @default(now())

  @@index([englishSlug])
}
```

- [ ] **Step 2: Написать миграцию**

Создать `prisma/migrations/20260901120000_add_ufc_athlete_slug_alias/migration.sql`:

```sql
CREATE TABLE "UfcAthleteSlugAlias" (
    "officialSlug" TEXT NOT NULL,
    "englishSlug" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UfcAthleteSlugAlias_pkey" PRIMARY KEY ("officialSlug")
);

CREATE INDEX "UfcAthleteSlugAlias_englishSlug_idx" ON "UfcAthleteSlugAlias"("englishSlug");
```

- [ ] **Step 3: Сгенерировать клиент и проверить типы**

Run:
```bash
npm run prisma:generate:pg
npm run typecheck
```

Expected: обе команды завершаются без ошибок.

**Внимание:** именно `prisma:generate:pg`. Голый `prisma generate` берёт sqlite-схему и ломает typecheck.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/schema.postgres.prisma prisma/migrations/20260901120000_add_ufc_athlete_slug_alias/migration.sql
git commit -m "feat(rankings): таблица соответствий слагов атлетов UFC"
```

---

### Task 2: Разбор `hreflang`

**Files:**
- Create: `lib/ufc-athlete-slug.ts`
- Create: `tests/ufc-athlete-slug.test.ts`

- [ ] **Step 1: Написать падающий тест**

Создать `tests/ufc-athlete-slug.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { extractEnglishAthleteSlug } from "../lib/ufc-athlete-slug";

// Реальная разметка ufc.ru: языковых альтернатив много, и en-zxx идёт первым.
// Брать нужно ровно hreflang="en", иначе региональные варианты дадут ложное совпадение.
const ATHLETE_HTML = `
  <link rel="canonical" href="https://ufc.ru/athlete/dzhastin-getzhi">
  <link rel="alternate" hreflang="en-zxx" href="https://ufc.ru/athlete/justin-gaethje">
  <link rel="alternate" hreflang="en" href="https://ufc.ru/athlete/justin-gaethje">
  <link rel="alternate" hreflang="en-aus" href="https://ufc.ru/athlete/justin-gaethje">
  <link rel="alternate" hreflang="ru" href="https://ufc.ru/athlete/dzhastin-getzhi">
`;

test("extractEnglishAthleteSlug берёт слаг из hreflang=en", () => {
  assert.equal(extractEnglishAthleteSlug(ATHLETE_HTML), "justin-gaethje");
});

test("extractEnglishAthleteSlug чинит переиспользованный слаг UFC", () => {
  // Тацуро Таира лежит под слагом, доставшимся от другого бойца.
  const html = `<link rel="alternate" hreflang="en" href="https://ufc.ru/athlete/tatsuro-taira">`;
  assert.equal(extractEnglishAthleteSlug(html), "tatsuro-taira");
});

test("extractEnglishAthleteSlug терпит другой порядок атрибутов", () => {
  const html = `<link href="https://ufc.ru/athlete/tom-aspinall" hreflang="en" rel="alternate" />`;
  assert.equal(extractEnglishAthleteSlug(html), "tom-aspinall");
});

test("extractEnglishAthleteSlug возвращает null без hreflang=en", () => {
  const html = `<link rel="alternate" hreflang="ru" href="https://ufc.ru/athlete/petr-yan">`;
  assert.equal(extractEnglishAthleteSlug(html), null);
});

test("extractEnglishAthleteSlug возвращает null, если href не ведёт на атлета", () => {
  const html = `<link rel="alternate" hreflang="en" href="https://ufc.ru/rankings">`;
  assert.equal(extractEnglishAthleteSlug(html), null);
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `npm test -- --test-name-pattern="extractEnglishAthleteSlug"`

Expected: FAIL — модуль `../lib/ufc-athlete-slug` не найден.

- [ ] **Step 3: Написать минимальную реализацию**

Создать `lib/ufc-athlete-slug.ts`:

```ts
// UFC.com редиректит российские IP на ufc.ru, где слаг атлета транслитерирован
// («dzhastin-getzhi») и иногда вообще достался от другого бойца
// («dzheremaya-uells-0» — это Тацуро Таира). Английский слаг, совпадающий с
// нашим Fighter.slug, лежит в языковой альтернативе страницы.
const ATHLETE_HREF = /\/athlete\/([^"'/?#]+)/i;

export function extractEnglishAthleteSlug(html: string): string | null {
  // Атрибуты в реальной разметке идут в разном порядке, поэтому ищем тег
  // целиком и проверяем hreflang отдельно. Строго "en": региональные en-aus,
  // en-can и служебный en-zxx нам не нужны.
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/\bhreflang=["']en["']/i.test(tag)) continue;

    const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
    const slug = href?.match(ATHLETE_HREF)?.[1];
    if (slug) return slug;
  }

  return null;
}
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

Run: `npm test -- --test-name-pattern="extractEnglishAthleteSlug"`

Expected: PASS, 5 тестов.

- [ ] **Step 5: Commit**

```bash
git add lib/ufc-athlete-slug.ts tests/ufc-athlete-slug.test.ts
git commit -m "feat(rankings): разбор английского слага атлета из hreflang"
```

---

### Task 3: Подстановка слагов в группы рейтинга

**Files:**
- Modify: `lib/ufc-athlete-slug.ts`
- Modify: `tests/ufc-athlete-slug.test.ts`

- [ ] **Step 1: Написать падающий тест**

Импорты добавить к существующим в начале `tests/ufc-athlete-slug.test.ts`:

```ts
import { applyAthleteSlugAliases, collectAthleteSlugs, extractEnglishAthleteSlug } from "../lib/ufc-athlete-slug";
import type { UfcOfficialRankingGroup } from "../lib/ufc-rankings";
```

(строка импорта `extractEnglishAthleteSlug` из Task 2 при этом заменяется на объединённую)

Тела тестов дописать в конец файла:

```ts
function makeGroups(): UfcOfficialRankingGroup[] {
  return [
    {
      title: "Легкий вес",
      champion: { name: "Ислам Махачев", officialSlug: "islam-makhachev", imageUrl: null },
      rows: [
        { rank: 1, name: "Джастин Гейджи", officialSlug: "dzhastin-getzhi", badge: null },
        { rank: 2, name: "Бенуа Сэн-Дени", officialSlug: "mariya-agapova-0", badge: null }
      ]
    }
  ];
}

test("collectAthleteSlugs собирает слаги чемпионов и строк без дублей", () => {
  const groups = makeGroups();
  groups[0]!.rows.push({ rank: 3, name: "Ислам Махачев", officialSlug: "islam-makhachev", badge: null });

  assert.deepEqual(collectAthleteSlugs(groups), ["islam-makhachev", "dzhastin-getzhi", "mariya-agapova-0"]);
});

test("applyAthleteSlugAliases подставляет английские слаги", () => {
  const resolved = new Map([
    ["dzhastin-getzhi", "justin-gaethje"],
    ["mariya-agapova-0", "benoit-saint-denis"]
  ]);

  const result = applyAthleteSlugAliases(makeGroups(), resolved);

  assert.deepEqual(
    result[0]?.rows.map((row) => row.officialSlug),
    ["justin-gaethje", "benoit-saint-denis"]
  );
});

test("applyAthleteSlugAliases сохраняет неразрешённый слаг как есть", () => {
  const result = applyAthleteSlugAliases(makeGroups(), new Map([["dzhastin-getzhi", "justin-gaethje"]]));

  // Резолв не удался — оставляем русский слаг, строка упадёт на матч по имени.
  assert.equal(result[0]?.rows[1]?.officialSlug, "mariya-agapova-0");
  assert.equal(result[0]?.champion.officialSlug, "islam-makhachev");
});

test("applyAthleteSlugAliases не мутирует исходные группы", () => {
  const groups = makeGroups();
  applyAthleteSlugAliases(groups, new Map([["dzhastin-getzhi", "justin-gaethje"]]));

  assert.equal(groups[0]?.rows[0]?.officialSlug, "dzhastin-getzhi");
});
```

- [ ] **Step 2: Запустить тесты и убедиться, что они падают**

Run: `npm test -- --test-name-pattern="AthleteSlugAliases|collectAthleteSlugs"`

Expected: FAIL — `applyAthleteSlugAliases` и `collectAthleteSlugs` не экспортируются.

- [ ] **Step 3: Написать реализацию**

Импорт типа добавить **в начало** `lib/ufc-athlete-slug.ts`, до объявления `ATHLETE_HREF`:

```ts
import type { UfcOfficialRankingGroup } from "@/lib/ufc-rankings";
```

Остальное дописать в конец файла:

```ts
export function collectAthleteSlugs(groups: UfcOfficialRankingGroup[]): string[] {
  const slugs = new Set<string>();

  for (const group of groups) {
    if (group.champion.officialSlug) slugs.add(group.champion.officialSlug);
    for (const row of group.rows) {
      if (row.officialSlug) slugs.add(row.officialSlug);
    }
  }

  return [...slugs];
}

// Неразрешённые слаги остаются нетронутыми: страница тогда падает на матч по
// имени, а затем на «Ожидается» — то же поведение, что и до резолва.
export function applyAthleteSlugAliases(
  groups: UfcOfficialRankingGroup[],
  resolved: Map<string, string>
): UfcOfficialRankingGroup[] {
  if (resolved.size === 0) return groups;

  return groups.map((group) => ({
    ...group,
    champion: {
      ...group.champion,
      officialSlug: resolved.get(group.champion.officialSlug) ?? group.champion.officialSlug
    },
    rows: group.rows.map((row) => ({
      ...row,
      officialSlug: resolved.get(row.officialSlug) ?? row.officialSlug
    }))
  }));
}
```

- [ ] **Step 4: Запустить тесты и убедиться, что они проходят**

Run: `npm test -- --test-name-pattern="AthleteSlugAliases|collectAthleteSlugs"`

Expected: PASS, 4 теста.

- [ ] **Step 5: Commit**

```bash
git add lib/ufc-athlete-slug.ts tests/ufc-athlete-slug.test.ts
git commit -m "feat(rankings): подстановка английских слагов в группы рейтинга"
```

---

### Task 4: Оркестрация резолва с бюджетом

**Files:**
- Modify: `lib/ufc-athlete-slug.ts`
- Modify: `tests/ufc-athlete-slug.test.ts`

- [ ] **Step 1: Написать падающий тест**

`resolveAthleteSlugAliases` добавить в уже существующий импорт из `../lib/ufc-athlete-slug` в начале файла, тела тестов дописать в конец:

```ts
function htmlFor(slug: string) {
  return `<link rel="alternate" hreflang="en" href="https://ufc.ru/athlete/${slug}">`;
}

test("resolveAthleteSlugAliases берёт известные слаги из кэша без запросов", async () => {
  const requested: string[] = [];

  const result = await resolveAthleteSlugAliases({
    slugs: ["dzhastin-getzhi"],
    known: new Map([["dzhastin-getzhi", "justin-gaethje"]]),
    fetchHtml: async (slug) => {
      requested.push(slug);
      return htmlFor("wrong");
    }
  });

  assert.deepEqual(requested, []);
  assert.equal(result.resolved.get("dzhastin-getzhi"), "justin-gaethje");
  assert.deepEqual(result.discovered, []);
});

test("resolveAthleteSlugAliases возвращает новые соответствия для записи", async () => {
  const result = await resolveAthleteSlugAliases({
    slugs: ["tom-aspinell", "dzheremaya-uells-0"],
    known: new Map(),
    fetchHtml: async (slug) =>
      htmlFor(slug === "tom-aspinell" ? "tom-aspinall" : "tatsuro-taira")
  });

  assert.equal(result.resolved.get("tom-aspinell"), "tom-aspinall");
  assert.equal(result.resolved.get("dzheremaya-uells-0"), "tatsuro-taira");
  assert.deepEqual(
    [...result.discovered].sort((a, b) => a.officialSlug.localeCompare(b.officialSlug)),
    [
      { officialSlug: "dzheremaya-uells-0", englishSlug: "tatsuro-taira" },
      { officialSlug: "tom-aspinell", englishSlug: "tom-aspinall" }
    ]
  );
});

test("resolveAthleteSlugAliases переживает падение отдельного атлета", async () => {
  const result = await resolveAthleteSlugAliases({
    slugs: ["broken", "tom-aspinell"],
    known: new Map(),
    fetchHtml: async (slug) => {
      if (slug === "broken") throw new Error("network down");
      return htmlFor("tom-aspinall");
    }
  });

  assert.equal(result.resolved.has("broken"), false);
  assert.equal(result.resolved.get("tom-aspinell"), "tom-aspinall");
});

test("resolveAthleteSlugAliases пропускает страницу без hreflang", async () => {
  const result = await resolveAthleteSlugAliases({
    slugs: ["no-alternate"],
    known: new Map(),
    fetchHtml: async () => "<html><head></head></html>"
  });

  assert.equal(result.resolved.size, 0);
  assert.deepEqual(result.discovered, []);
});

test("resolveAthleteSlugAliases останавливается по исчерпании бюджета", async () => {
  let clock = 0;
  const requested: string[] = [];

  const result = await resolveAthleteSlugAliases({
    slugs: ["a", "b", "c"],
    known: new Map(),
    concurrency: 1,
    budgetMs: 100,
    now: () => clock,
    fetchHtml: async (slug) => {
      requested.push(slug);
      clock += 60; // каждый запрос «съедает» 60 мс
      return htmlFor(`${slug}-en`);
    }
  });

  // Бюджет проверяется перед каждым запросом: два успевают, третий уже нет.
  assert.deepEqual(requested, ["a", "b"]);
  assert.equal(result.resolved.size, 2);
});
```

- [ ] **Step 2: Запустить тесты и убедиться, что они падают**

Run: `npm test -- --test-name-pattern="resolveAthleteSlugAliases"`

Expected: FAIL — `resolveAthleteSlugAliases` не экспортируется.

- [ ] **Step 3: Написать реализацию**

Дописать в `lib/ufc-athlete-slug.ts`:

```ts
export type AthleteSlugAlias = {
  officialSlug: string;
  englishSlug: string;
};

export type ResolveAthleteSlugAliasesOptions = {
  slugs: string[];
  known: Map<string, string>;
  fetchHtml: (slug: string) => Promise<string | null>;
  budgetMs?: number;
  concurrency?: number;
  now?: () => number;
};

export type ResolveAthleteSlugAliasesResult = {
  resolved: Map<string, string>;
  discovered: AthleteSlugAlias[];
};

export const ATHLETE_SLUG_RESOLVE_BUDGET_MS = 90_000;
export const ATHLETE_SLUG_RESOLVE_CONCURRENCY = 4;

// Первый прогон встречает ~150 незнакомых слагов, а ufc.ru отвечает за 2-6
// секунд. Бюджет по времени не даёт обновлению рейтинга растянуться: что не
// успели — доедет следующим запуском крона, потому что соответствия копятся в
// таблице. Ошибки намеренно проглатываются: непрорезолвленный слаг оставляет
// строку в том же состоянии, в каком она была до этой фичи.
export async function resolveAthleteSlugAliases({
  slugs,
  known,
  fetchHtml,
  budgetMs = ATHLETE_SLUG_RESOLVE_BUDGET_MS,
  concurrency = ATHLETE_SLUG_RESOLVE_CONCURRENCY,
  now = Date.now
}: ResolveAthleteSlugAliasesOptions): Promise<ResolveAthleteSlugAliasesResult> {
  const resolved = new Map<string, string>();
  const discovered: AthleteSlugAlias[] = [];
  const pending: string[] = [];

  for (const slug of slugs) {
    const cached = known.get(slug);
    if (cached) {
      resolved.set(slug, cached);
    } else {
      pending.push(slug);
    }
  }

  if (pending.length === 0) return { resolved, discovered };

  const deadline = now() + budgetMs;
  let cursor = 0;

  async function worker() {
    while (cursor < pending.length && now() < deadline) {
      const slug = pending[cursor++]!;

      try {
        const html = await fetchHtml(slug);
        const englishSlug = html ? extractEnglishAthleteSlug(html) : null;
        if (!englishSlug) continue;

        resolved.set(slug, englishSlug);
        discovered.push({ officialSlug: slug, englishSlug });
      } catch {
        // Один недоступный атлет не должен ронять остальных.
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, worker));

  return { resolved, discovered };
}
```

- [ ] **Step 4: Запустить тесты и убедиться, что они проходят**

Run: `npm test -- --test-name-pattern="resolveAthleteSlugAliases"`

Expected: PASS, 5 тестов.

- [ ] **Step 5: Прогнать весь файл тестов**

Run: `npm test -- --test-name-pattern="AthleteSlug|collectAthleteSlugs|extractEnglish"`

Expected: PASS, 14 тестов.

- [ ] **Step 6: Commit**

```bash
git add lib/ufc-athlete-slug.ts tests/ufc-athlete-slug.test.ts
git commit -m "feat(rankings): резолв слагов атлетов с бюджетом и устойчивостью к сбоям"
```

---

### Task 5: Слой базы данных

**Files:**
- Create: `lib/db/ufc-athlete-slugs.ts`
- Modify: `lib/db/index.ts`

Тестов здесь нет намеренно: вся логика уже покрыта в Task 2–4, а этот файл — тонкая обвязка над Prisma и `fetch`. Он проверяется на живом прогоне в Task 8.

- [ ] **Step 1: Написать модуль**

Создать `lib/db/ufc-athlete-slugs.ts`:

```ts
import { prisma } from "@/lib/prisma";
import {
  resolveAthleteSlugAliases,
  type ResolveAthleteSlugAliasesOptions
} from "@/lib/ufc-athlete-slug";

const ATHLETE_FETCH_TIMEOUT_MS = 10_000;

// Cloudflare на ufc.com отдаёт 403 на реалистичный браузерный user-agent и
// пропускает вот этот. Тот же заголовок используется в lib/ufc-rankings.ts.
// Не менять.
const UFC_USER_AGENT = "Mozilla/5.0 FightBase/1.0";

async function fetchAthleteHtml(slug: string): Promise<string | null> {
  try {
    const response = await fetch(`https://www.ufc.com/athlete/${encodeURIComponent(slug)}`, {
      headers: { "user-agent": UFC_USER_AGENT },
      cache: "no-store",
      signal: AbortSignal.timeout(ATHLETE_FETCH_TIMEOUT_MS)
    });

    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

export async function resolveEnglishAthleteSlugs(
  slugs: string[],
  options: Partial<Pick<ResolveAthleteSlugAliasesOptions, "fetchHtml" | "budgetMs" | "concurrency">> = {}
): Promise<Map<string, string>> {
  if (slugs.length === 0) return new Map();

  const aliases = await prisma.ufcAthleteSlugAlias.findMany({
    where: { officialSlug: { in: slugs } },
    select: { officialSlug: true, englishSlug: true }
  });

  const known = new Map(aliases.map((alias) => [alias.officialSlug, alias.englishSlug]));

  const { resolved, discovered } = await resolveAthleteSlugAliases({
    slugs,
    known,
    fetchHtml: options.fetchHtml ?? fetchAthleteHtml,
    budgetMs: options.budgetMs,
    concurrency: options.concurrency
  });

  if (discovered.length > 0) {
    await prisma.ufcAthleteSlugAlias.createMany({
      data: discovered,
      skipDuplicates: true
    });
  }

  return resolved;
}
```

- [ ] **Step 2: Добавить реэкспорт**

В `lib/db/index.ts` дописать рядом с остальными строками `export * from`:

```ts
export * from "./ufc-athlete-slugs";
```

- [ ] **Step 3: Проверить типы**

Run: `npm run typecheck`

Expected: без ошибок.

- [ ] **Step 4: Commit**

```bash
git add lib/db/ufc-athlete-slugs.ts lib/db/index.ts
git commit -m "feat(rankings): кэш соответствий слагов атлетов в базе"
```

---

### Task 6: Встроить резолв в обновление снимка

**Files:**
- Modify: `lib/db/rankings.ts:23-63`

- [ ] **Step 1: Изменить `refreshUfcRankingSnapshot`**

В `lib/db/rankings.ts` добавить импорты рядом с существующими:

```ts
import { applyAthleteSlugAliases, collectAthleteSlugs } from "@/lib/ufc-athlete-slug";
import { resolveEnglishAthleteSlugs } from "@/lib/db/ufc-athlete-slugs";
```

Заменить строку

```ts
  const incomingGroups = await fetchUfcOfficialRankings();
```

на

```ts
  const rawGroups = await fetchUfcOfficialRankings();
  // UFC.com редиректит наш IP на ufc.ru, откуда слаги приходят русскими и с
  // локальными Fighter.slug не совпадают. Резолв не имеет права уронить
  // обновление: любая ошибка оставляет русский слаг, и строка ведёт себя как
  // раньше.
  const incomingGroups = await resolveRankingSlugs(rawGroups);
```

Добавить перед `refreshUfcRankingSnapshot`:

```ts
async function resolveRankingSlugs(groups: UfcOfficialRankingGroup[]) {
  if (groups.length === 0) return groups;

  try {
    const resolved = await resolveEnglishAthleteSlugs(collectAthleteSlugs(groups));
    return applyAthleteSlugAliases(groups, resolved);
  } catch (error) {
    console.error("[ufc-rankings] slug resolution failed; keeping upstream slugs", error);
    return groups;
  }
}
```

Дописать импорт типа к существующему импорту из `@/lib/ufc-rankings`:

```ts
import { fetchUfcOfficialRankings, type UfcOfficialRankingGroup } from "@/lib/ufc-rankings";
```

- [ ] **Step 2: Проверить типы**

Run: `npm run typecheck`

Expected: без ошибок.

- [ ] **Step 3: Прогнать весь набор тестов**

Run: `npm test`

Expected: все тесты зелёные, включая существующие `tests/ufc-ranking-snapshot.test.ts` и `tests/ufc-rankings.test.ts`.

- [ ] **Step 4: Commit**

```bash
git add lib/db/rankings.ts
git commit -m "feat(rankings): резолвить английские слаги перед записью снимка"
```

---

### Task 7: Скрипт прогрева кэша

**Files:**
- Create: `scripts/backfill-ufc-slug-aliases.js`
- Modify: `package.json`

Скрипт нужен, потому что `scripts/sync-ufc-rankings.js` дёргает HTTP-эндпоинт с таймаутом 30 секунд, а первый резолв занимает минуты. Скрипт работает с базой напрямую и не ограничен этим таймаутом.

- [ ] **Step 1: Написать скрипт**

Создать `scripts/backfill-ufc-slug-aliases.js`:

```js
#!/usr/bin/env node

// Прогревает таблицу UfcAthleteSlugAlias по текущему снимку рейтингов, чтобы
// не ждать, пока кэш наполнится за несколько запусков крона. Идемпотентен:
// уже известные слаги пропускаются.

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const ATHLETE_FETCH_TIMEOUT_MS = 10_000;
// Тот же user-agent, что в lib/ufc-rankings.ts. Браузерный получает 403.
const UFC_USER_AGENT = "Mozilla/5.0 FightBase/1.0";

function extractEnglishAthleteSlug(html) {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/\bhreflang=["']en["']/i.test(tag)) continue;

    const href = (tag.match(/\bhref=["']([^"']+)["']/i) || [])[1];
    const slug = href && (href.match(/\/athlete\/([^"'/?#]+)/i) || [])[1];
    if (slug) return slug;
  }

  return null;
}

async function fetchAthleteHtml(slug) {
  const response = await fetch(`https://www.ufc.com/athlete/${encodeURIComponent(slug)}`, {
    headers: { "user-agent": UFC_USER_AGENT },
    cache: "no-store",
    signal: AbortSignal.timeout(ATHLETE_FETCH_TIMEOUT_MS)
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function collectSlugs(groups) {
  const slugs = new Set();

  for (const group of groups) {
    if (group.champion && group.champion.officialSlug) slugs.add(group.champion.officialSlug);
    for (const row of group.rows || []) {
      if (row.officialSlug) slugs.add(row.officialSlug);
    }
  }

  return [...slugs];
}

async function main() {
  const snapshot = await prisma.ufcRankingSnapshot.findUnique({
    where: { key: "ufc-official-rankings" },
    select: { payload: true }
  });

  if (!snapshot) throw new Error("Снимок рейтингов не найден. Сначала обнови рейтинги.");

  const slugs = collectSlugs(JSON.parse(snapshot.payload));
  const existing = await prisma.ufcAthleteSlugAlias.findMany({
    where: { officialSlug: { in: slugs } },
    select: { officialSlug: true }
  });
  const known = new Set(existing.map((alias) => alias.officialSlug));
  const pending = slugs.filter((slug) => !known.has(slug));

  console.log(`Слагов в снимке: ${slugs.length}, уже известно: ${known.size}, к резолву: ${pending.length}`);

  let resolved = 0;
  let failed = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < pending.length) {
      const slug = pending[cursor++];

      try {
        const englishSlug = extractEnglishAthleteSlug(await fetchAthleteHtml(slug));

        if (!englishSlug) {
          failed += 1;
          console.warn(`  ${slug}: hreflang=en не найден`);
          continue;
        }

        await prisma.ufcAthleteSlugAlias.upsert({
          where: { officialSlug: slug },
          create: { officialSlug: slug, englishSlug },
          update: { englishSlug }
        });
        resolved += 1;
        console.log(`  ${slug} -> ${englishSlug}`);
      } catch (error) {
        failed += 1;
        console.warn(`  ${slug}: ${error.message || error}`);
      }
    }
  }

  await Promise.all(Array.from({ length: 4 }, worker));

  console.log(`Готово. Разрешено: ${resolved}, не удалось: ${failed}.`);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Добавить npm-скрипт**

В `package.json` в блок `scripts` дописать рядом с прочими `content:*`:

```json
"content:backfill-slug-aliases": "node scripts/backfill-ufc-slug-aliases.js",
```

- [ ] **Step 3: Commit**

```bash
git add scripts/backfill-ufc-slug-aliases.js package.json
git commit -m "feat(rankings): скрипт прогрева кэша слагов атлетов"
```

---

### Task 8: Проверка на проде

**Files:** нет изменений в коде

Смоук-тест не билдит проект, поэтому зелёный `npm run test:smoke` без предварительного `npm run build` ничего не подтверждает. Здесь проверяем на живых данных.

- [ ] **Step 1: Собрать и прогнать полный набор тестов локально**

Run:
```bash
npm run prisma:generate:pg
npm run typecheck
npm test
npm run build
```

Expected: всё зелёное.

- [ ] **Step 2: Слить в master и задеплоить**

```bash
git checkout master
git merge --no-ff fix/ranking-slug-resolution
git push origin master
```

Пуш в `origin/master` запускает автодеплой. Миграция применяется на сервере автоматически.

- [ ] **Step 3: Дождаться деплоя**

`gh` в системе нет — проверять курлом:

Run: `curl -s -o /dev/null -w "%{http_code}\n" https://fightbase.ru/ru/rankings`

Expected: `200`.

- [ ] **Step 4: Прогреть кэш слагов на сервере**

```bash
ssh -i ~/.ssh/fightbase_deploy root@fightbase.ru "cd /opt/fightbase && npm run content:backfill-slug-aliases"
```

Expected: строки вида `dzhastin-getzhi -> justin-gaethje`, в конце «Разрешено: ~150, не удалось: 0».

- [ ] **Step 5: Обновить снимок рейтингов**

```bash
ssh -i ~/.ssh/fightbase_deploy root@fightbase.ru "cd /opt/fightbase && npm run content:sync-ufc-rankings"
```

Expected: `UFC rankings refreshed: N groups…`.

- [ ] **Step 6: Замерить результат**

```bash
curl -s https://fightbase.ru/ru/rankings -o /tmp/r.html
echo "Ожидается: $(grep -o 'Ожидается' /tmp/r.html | wc -l)"
echo "Открыть: $(grep -o '>Открыть<' /tmp/r.html | wc -l)"
```

Expected: «Ожидается» падает со 124 до единиц, «Открыть» растёт со 132 примерно до 250.

Если число не изменилось — снимок мог не перезаписаться. Проверить:

```bash
ssh -i ~/.ssh/fightbase_deploy root@fightbase.ru "cd /opt/fightbase && grep -o 'postgresql://[^\"]*' .env | head -1"
```

и посмотреть `fetchedAt` в `UfcRankingSnapshot`, а также содержимое `UfcAthleteSlugAlias`.

- [ ] **Step 7: Разобрать остаток**

Если после прогона осталось больше пяти «Ожидается» — выписать, каких бойцов не хватает, и проверить: это отсутствие записи `Fighter` в базе (тогда нужна отдельная задача на добор ростера) или неудачный резолв слага.

---

## Что осознанно не делается

**Нечёткое сопоставление по русским именам** отклонено в спеке: риск подставить чужой профиль хуже, чем честное «Ожидается».

**Заполнение пустых полей у бойцов** — отдельная задача. По базе есть реальные пробелы (403 бойца без фото, 1528 без зала), но к рейтингам они отношения не имеют: там все бойцы заполнены. Не смешивать с этой работой.

**TTL для алиасов** не нужен: соответствие ru-слага английскому не меняется.
