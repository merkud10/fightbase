# SEO Structured Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть три подтверждённых пробела в JSON-LD сайта: отсутствующий `SearchAction`, отсутствующие `BreadcrumbList` на пяти listing-страницах и отсутствующий `publisher.logo` в разметке статей.

**Architecture:** Вся генерация JSON-LD выносится в чистые функции в `lib/structured-data.ts` — там уже живёт `buildSportsEventJsonLd` и рядом лежит `tests/structured-data.test.ts`. Функции не трогают БД, не читают request-контекст и принимают `siteUrl` параметром, поэтому тестируются юнит-тестами без окружения. Страницы становятся тонкими вызовами хелперов; три страницы, где `BreadcrumbList` собран инлайном, переводятся на общий хелпер (DRY).

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5.8, `node:test` + `tsx` (запуск: `npm test`).

---

## Проверенное исходное состояние

Установлено чтением кода перед написанием плана:

- `grep -rn "potentialAction\|SearchAction" app lib components` → **0 совпадений**. Страница поиска существует: `app/search/page.tsx:42` читает параметр `q`.
- `grep -rln "BreadcrumbList" app` → только `app/compare/[pair]/page.tsx`, `app/events/[slug]/page.tsx`, `app/fighters/[slug]/page.tsx`. Плюс `components/article-detail-page.tsx:186` (покрывает news/analysis/quotes). **Не покрыты пять listing-страниц.**
- `components/article-detail-page.tsx:211-215` — у `publisher` нет `logo`.
- `public/gorilla-crown-logo.png` существует, размер **1024x1024** (прочитан заголовок PNG).
- Все пять listing-страниц уже импортируют `JsonLd`, `localizePath`, `getSiteUrl` и имеют в теле `const siteUrl = getSiteUrl();` и `const locale = await getLocale();`.

**Вне области этого плана** (осознанно): `generateStaticParams`, размер `app/globals.css`, запросы без `take`. Это отдельные подсистемы с отдельными компромиссами.

---

## Структура файлов

| Файл | Ответственность | Действие |
|---|---|---|
| `lib/structured-data.ts` | Чистые билдеры JSON-LD | Modify — добавить 3 функции |
| `tests/structured-data.test.ts` | Юнит-тесты билдеров | Modify — добавить тесты |
| `app/layout.tsx` | Общесайтовый JSON-LD | Modify — использовать `buildWebSiteJsonLd` |
| `components/article-detail-page.tsx` | Разметка статьи | Modify — `publisher` через хелпер, breadcrumb через хелпер |
| `app/news/(list)/page.tsx` | Листинг новостей | Modify — добавить breadcrumb |
| `app/events/(list)/page.tsx` | Листинг турниров | Modify — добавить breadcrumb |
| `app/fighters/(list)/page.tsx` | Листинг бойцов | Modify — добавить breadcrumb |
| `app/rankings/page.tsx` | Рейтинги | Modify — добавить breadcrumb |
| `app/predictions/(list)/page.tsx` | Листинг прогнозов | Modify — добавить breadcrumb |
| `app/events/[slug]/page.tsx` | Страница турнира | Modify — перевести на хелпер |
| `app/fighters/[slug]/page.tsx` | Страница бойца | Modify — перевести на хелпер |
| `app/compare/[pair]/page.tsx` | Сравнение | Modify — перевести на хелпер |

---

### Task 1: Хелпер `buildBreadcrumbJsonLd`

**Files:**
- Modify: `lib/structured-data.ts`
- Test: `tests/structured-data.test.ts`

- [ ] **Step 1: Написать падающий тест**

Добавить в конец `tests/structured-data.test.ts`. Также добавить `buildBreadcrumbJsonLd` в существующий импорт в первой строке импортов из `../lib/structured-data`.

```ts
test("buildBreadcrumbJsonLd нумерует позиции с единицы и сохраняет порядок", () => {
  const jsonLd = buildBreadcrumbJsonLd([
    { name: "Главная", url: "https://fightbase.ru/ru" },
    { name: "Новости", url: "https://fightbase.ru/ru/news" }
  ]) as { "@type": string; itemListElement: Array<Record<string, unknown>> };

  assert.equal(jsonLd["@type"], "BreadcrumbList");
  assert.deepEqual(jsonLd.itemListElement, [
    { "@type": "ListItem", position: 1, name: "Главная", item: "https://fightbase.ru/ru" },
    { "@type": "ListItem", position: 2, name: "Новости", item: "https://fightbase.ru/ru/news" }
  ]);
});

test("buildBreadcrumbJsonLd отбрасывает крошки без имени", () => {
  const jsonLd = buildBreadcrumbJsonLd([
    { name: "Главная", url: "https://fightbase.ru/ru" },
    { name: "   ", url: "https://fightbase.ru/ru/news" },
    { name: "UFC 330", url: "https://fightbase.ru/ru/events/ufc-330" }
  ]) as { itemListElement: Array<{ position: number; name: string }> };

  assert.equal(jsonLd.itemListElement.length, 2);
  assert.deepEqual(
    jsonLd.itemListElement.map((item) => item.position),
    [1, 2]
  );
  assert.equal(jsonLd.itemListElement[1]?.name, "UFC 330");
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `npm test`
Expected: FAIL — TypeScript/runtime ошибка о том, что `buildBreadcrumbJsonLd` не экспортируется из `../lib/structured-data`.

- [ ] **Step 3: Минимальная реализация**

Добавить в `lib/structured-data.ts`:

```ts
export type BreadcrumbCrumb = {
  name: string;
  url: string;
};

export function buildBreadcrumbJsonLd(crumbs: BreadcrumbCrumb[]): Record<string, unknown> {
  const visible = crumbs.filter((crumb) => crumb.name.trim().length > 0);

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: visible.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: crumb.url
    }))
  };
}
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

Run: `npm test`
Expected: PASS, оба новых теста зелёные.

- [ ] **Step 5: Коммит**

```bash
git add lib/structured-data.ts tests/structured-data.test.ts
git commit -m "feat(seo): добавить общий билдер BreadcrumbList"
```

---

### Task 2: `SearchAction` в разметке сайта

**Files:**
- Modify: `lib/structured-data.ts`
- Modify: `app/layout.tsx:163-175`
- Test: `tests/structured-data.test.ts`

- [ ] **Step 1: Написать падающий тест**

Добавить `buildWebSiteJsonLd` в импорт из `../lib/structured-data` и дописать в `tests/structured-data.test.ts`:

```ts
test("buildWebSiteJsonLd объявляет SearchAction на страницу поиска", () => {
  const jsonLd = buildWebSiteJsonLd("https://fightbase.ru") as {
    "@type": string;
    potentialAction: { "@type": string; target: { urlTemplate: string }; "query-input": string };
  };

  assert.equal(jsonLd["@type"], "WebSite");
  assert.equal(jsonLd.potentialAction["@type"], "SearchAction");
  assert.equal(jsonLd.potentialAction.target.urlTemplate, "https://fightbase.ru/ru/search?q={search_term_string}");
  assert.equal(jsonLd.potentialAction["query-input"], "required name=search_term_string");
});
```

Параметр `q` совпадает с тем, что читает `app/search/page.tsx:42`.

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `npm test`
Expected: FAIL — `buildWebSiteJsonLd` не экспортируется.

- [ ] **Step 3: Минимальная реализация**

Добавить в `lib/structured-data.ts`:

```ts
export function buildWebSiteJsonLd(siteUrl: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "FightBase Media",
    url: `${siteUrl}/ru`,
    publisher: {
      "@type": "Organization",
      name: "FightBase Media"
    },
    inLanguage: "ru-RU",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${siteUrl}/ru/search?q={search_term_string}`
      },
      "query-input": "required name=search_term_string"
    }
  };
}
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Подключить хелпер в layout**

В `app/layout.tsx` заменить второй блок `<JsonLd>` (строки 163-175, тот, где `"@type": "WebSite"`) на:

```tsx
<JsonLd data={buildWebSiteJsonLd(siteUrl)} />
```

Добавить в импорты `app/layout.tsx`:

```tsx
import { buildWebSiteJsonLd } from "@/lib/structured-data";
```

Первый блок `<JsonLd>` с `"@type": "NewsMediaOrganization"` оставить без изменений.

- [ ] **Step 6: Проверить типы и сборку**

Run: `npm run typecheck`
Expected: без ошибок.

- [ ] **Step 7: Коммит**

```bash
git add lib/structured-data.ts tests/structured-data.test.ts app/layout.tsx
git commit -m "feat(seo): объявить SearchAction в разметке WebSite"
```

---

### Task 3: `publisher.logo` в разметке статьи

**Files:**
- Modify: `lib/structured-data.ts`
- Modify: `components/article-detail-page.tsx:211-215`
- Test: `tests/structured-data.test.ts`

- [ ] **Step 1: Написать падающий тест**

Добавить `buildPublisherJsonLd` в импорт и дописать в `tests/structured-data.test.ts`:

```ts
test("buildPublisherJsonLd отдаёт логотип с абсолютным URL и размерами", () => {
  const publisher = buildPublisherJsonLd("https://fightbase.ru") as {
    "@type": string;
    name: string;
    logo: { "@type": string; url: string; width: number; height: number };
  };

  assert.equal(publisher["@type"], "Organization");
  assert.equal(publisher.name, "FightBase Media");
  assert.equal(publisher.logo["@type"], "ImageObject");
  assert.equal(publisher.logo.url, "https://fightbase.ru/gorilla-crown-logo.png");
  assert.equal(publisher.logo.width, 1024);
  assert.equal(publisher.logo.height, 1024);
});
```

Размеры 1024x1024 сверены с реальным `public/gorilla-crown-logo.png`.

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `npm test`
Expected: FAIL — `buildPublisherJsonLd` не экспортируется.

- [ ] **Step 3: Минимальная реализация**

Добавить в `lib/structured-data.ts`:

```ts
export function buildPublisherJsonLd(siteUrl: string): Record<string, unknown> {
  return {
    "@type": "Organization",
    name: "FightBase Media",
    url: `${siteUrl}/ru`,
    logo: {
      "@type": "ImageObject",
      url: `${siteUrl}/gorilla-crown-logo.png`,
      width: 1024,
      height: 1024
    }
  };
}
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Подключить в разметку статьи**

В `components/article-detail-page.tsx` заменить блок на строках 211-215:

```tsx
    publisher: {
      "@type": "Organization",
      name: "FightBase Media",
      url: `${siteUrl}/ru`
    },
```

на:

```tsx
    publisher: buildPublisherJsonLd(siteUrl),
```

Добавить в импорты `components/article-detail-page.tsx`:

```tsx
import { buildPublisherJsonLd } from "@/lib/structured-data";
```

- [ ] **Step 6: Проверить типы**

Run: `npm run typecheck`
Expected: без ошибок.

- [ ] **Step 7: Коммит**

```bash
git add lib/structured-data.ts tests/structured-data.test.ts components/article-detail-page.tsx
git commit -m "feat(seo): добавить logo издателя в разметку статьи"
```

---

### Task 4: `BreadcrumbList` на листинге новостей

**Files:**
- Modify: `app/news/(list)/page.tsx`

- [ ] **Step 1: Добавить импорт**

В `app/news/(list)/page.tsx` рядом с существующим `import { ogImageUrl } from "@/lib/seo";` добавить:

```tsx
import { buildBreadcrumbJsonLd } from "@/lib/structured-data";
```

- [ ] **Step 2: Добавить разметку**

`siteUrl` и `collectionUrl` уже объявлены на строках 73-74. Сразу после открывающего `<main className="container">` (строка 84) вставить перед существующим блоком `CollectionPage`:

```tsx
      <JsonLd
        data={buildBreadcrumbJsonLd([
          {
            name: locale === "ru" ? "Главная" : "Home",
            url: new URL(localizePath("/", locale), siteUrl).toString()
          },
          {
            name: locale === "ru" ? "Новости" : "News",
            url: collectionUrl
          }
        ])}
      />
```

- [ ] **Step 3: Проверить типы**

Run: `npm run typecheck`
Expected: без ошибок.

- [ ] **Step 4: Коммит**

```bash
git add "app/news/(list)/page.tsx"
git commit -m "feat(seo): добавить BreadcrumbList на листинг новостей"
```

---

### Task 5: `BreadcrumbList` на листинге турниров

**Files:**
- Modify: `app/events/(list)/page.tsx`

- [ ] **Step 1: Добавить импорт**

В `app/events/(list)/page.tsx` рядом с `import { ogImageUrl } from "@/lib/seo";` добавить:

```tsx
import { buildBreadcrumbJsonLd } from "@/lib/structured-data";
```

- [ ] **Step 2: Добавить разметку**

`siteUrl` и `collectionUrl` объявлены на строках 74-75. Сразу после `<main className="container">` (строка 85) вставить перед блоком `CollectionPage`:

```tsx
      <JsonLd
        data={buildBreadcrumbJsonLd([
          {
            name: locale === "ru" ? "Главная" : "Home",
            url: new URL(localizePath("/", locale), siteUrl).toString()
          },
          {
            name: locale === "ru" ? "Турниры" : "Events",
            url: collectionUrl
          }
        ])}
      />
```

Названия крошек совпадают с теми, что уже используются в `app/events/[slug]/page.tsx:103-105`.

- [ ] **Step 3: Проверить типы**

Run: `npm run typecheck`
Expected: без ошибок.

- [ ] **Step 4: Коммит**

```bash
git add "app/events/(list)/page.tsx"
git commit -m "feat(seo): добавить BreadcrumbList на листинг турниров"
```

---

### Task 6: `BreadcrumbList` на листинге бойцов

**Files:**
- Modify: `app/fighters/(list)/page.tsx`

- [ ] **Step 1: Добавить импорт**

В `app/fighters/(list)/page.tsx` рядом с `import { ogImageUrl } from "@/lib/seo";` добавить:

```tsx
import { buildBreadcrumbJsonLd } from "@/lib/structured-data";
```

- [ ] **Step 2: Добавить разметку**

`siteUrl` и `collectionUrl` объявлены на строках 85-86. Сразу после `<main className="container">` (строка 96) вставить перед блоком `CollectionPage`:

```tsx
      <JsonLd
        data={buildBreadcrumbJsonLd([
          {
            name: locale === "ru" ? "Главная" : "Home",
            url: new URL(localizePath("/", locale), siteUrl).toString()
          },
          {
            name: locale === "ru" ? "Бойцы" : "Fighters",
            url: collectionUrl
          }
        ])}
      />
```

- [ ] **Step 3: Проверить типы**

Run: `npm run typecheck`
Expected: без ошибок.

- [ ] **Step 4: Коммит**

```bash
git add "app/fighters/(list)/page.tsx"
git commit -m "feat(seo): добавить BreadcrumbList на листинг бойцов"
```

---

### Task 7: `BreadcrumbList` на рейтингах

**Files:**
- Modify: `app/rankings/page.tsx`

- [ ] **Step 1: Добавить импорт**

В `app/rankings/page.tsx` рядом с `import { ogImageUrl } from "@/lib/seo";` добавить:

```tsx
import { buildBreadcrumbJsonLd } from "@/lib/structured-data";
```

- [ ] **Step 2: Вынести URL страницы в переменную**

На этой странице нет `collectionUrl` — URL собран инлайном в `CollectionPage` (строка 107). Сразу после `const siteUrl = getSiteUrl();` (строка 61) добавить:

```tsx
  const collectionUrl = new URL(localizePath("/rankings", locale), siteUrl).toString();
```

Затем в блоке `CollectionPage` (строка 107) заменить

```tsx
          url: new URL(localizePath("/rankings", locale), siteUrl).toString(),
```

на

```tsx
          url: collectionUrl,
```

- [ ] **Step 3: Добавить разметку**

Сразу после `<main className="container">` (строка 101) вставить перед блоком `CollectionPage`:

```tsx
      <JsonLd
        data={buildBreadcrumbJsonLd([
          {
            name: locale === "ru" ? "Главная" : "Home",
            url: new URL(localizePath("/", locale), siteUrl).toString()
          },
          {
            name: locale === "ru" ? "Рейтинги" : "Rankings",
            url: collectionUrl
          }
        ])}
      />
```

- [ ] **Step 4: Проверить типы**

Run: `npm run typecheck`
Expected: без ошибок.

- [ ] **Step 5: Коммит**

```bash
git add app/rankings/page.tsx
git commit -m "feat(seo): добавить BreadcrumbList на страницу рейтингов"
```

---

### Task 8: `BreadcrumbList` на листинге прогнозов

**Files:**
- Modify: `app/predictions/(list)/page.tsx`

- [ ] **Step 1: Добавить импорт**

В `app/predictions/(list)/page.tsx` рядом с `import { buildPageMetadata } from "@/lib/page-metadata";` добавить:

```tsx
import { buildBreadcrumbJsonLd } from "@/lib/structured-data";
```

- [ ] **Step 2: Вынести URL страницы в переменную**

Сразу после `const siteUrl = getSiteUrl();` (строка 46) добавить:

```tsx
  const collectionUrl = new URL(localizePath("/predictions", locale), siteUrl).toString();
```

Затем в блоке `CollectionPage` (строка 76) заменить

```tsx
          url: new URL(localizePath("/predictions", locale), siteUrl).toString()
```

на

```tsx
          url: collectionUrl
```

- [ ] **Step 3: Добавить разметку**

Сразу после `<main className="container">` (строка 70) вставить перед блоком `CollectionPage`:

```tsx
      <JsonLd
        data={buildBreadcrumbJsonLd([
          {
            name: locale === "ru" ? "Главная" : "Home",
            url: new URL(localizePath("/", locale), siteUrl).toString()
          },
          {
            name: locale === "ru" ? "Прогнозы" : "Predictions",
            url: collectionUrl
          }
        ])}
      />
```

- [ ] **Step 4: Проверить типы**

Run: `npm run typecheck`
Expected: без ошибок.

- [ ] **Step 5: Коммит**

```bash
git add "app/predictions/(list)/page.tsx"
git commit -m "feat(seo): добавить BreadcrumbList на листинг прогнозов"
```

---

### Task 9: Перевести существующие инлайн-крошки на общий хелпер

Четыре места собирают `BreadcrumbList` вручную. Разметка должна остаться байт-в-байт эквивалентной — меняется только способ её построения.

**Files:**
- Modify: `app/events/[slug]/page.tsx:107-116`
- Modify: `app/fighters/[slug]/page.tsx`
- Modify: `app/compare/[pair]/page.tsx`
- Modify: `components/article-detail-page.tsx:186`

- [ ] **Step 1: Заменить в `app/events/[slug]/page.tsx`**

Текущий код на строках 107-116:

```tsx
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbItems.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      item: item.href ? `${siteUrl}${localizePath(item.href, locale)}` : eventUrl
    }))
  };
```

Заменить на:

```tsx
  const breadcrumbJsonLd = buildBreadcrumbJsonLd(
    breadcrumbItems.map((item) => ({
      name: item.label,
      url: item.href ? `${siteUrl}${localizePath(item.href, locale)}` : eventUrl
    }))
  );
```

Добавить `buildBreadcrumbJsonLd` в существующий импорт из `@/lib/structured-data` (в этом файле уже импортируется `buildSportsEventJsonLd`).

- [ ] **Step 2: Заменить в `app/fighters/[slug]/page.tsx`**

Текущий код на строках 417-426:

```tsx
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbItems.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      item: item.href ? `${siteUrl}${localizePath(item.href, locale)}` : fighterUrl
    }))
  };
```

Заменить на:

```tsx
  const breadcrumbJsonLd = buildBreadcrumbJsonLd(
    breadcrumbItems.map((item) => ({
      name: item.label,
      url: item.href ? `${siteUrl}${localizePath(item.href, locale)}` : fighterUrl
    }))
  );
```

Добавить импорт:

```tsx
import { buildBreadcrumbJsonLd } from "@/lib/structured-data";
```

- [ ] **Step 3: Заменить в `app/compare/[pair]/page.tsx`**

Текущий код на строках 116-125:

```tsx
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbItems.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      item: item.href ? `${siteUrl}${localizePath(item.href, locale)}` : pageUrl
    }))
  };
```

Заменить на:

```tsx
  const breadcrumbJsonLd = buildBreadcrumbJsonLd(
    breadcrumbItems.map((item) => ({
      name: item.label,
      url: item.href ? `${siteUrl}${localizePath(item.href, locale)}` : pageUrl
    }))
  );
```

Добавить импорт:

```tsx
import { buildBreadcrumbJsonLd } from "@/lib/structured-data";
```

- [ ] **Step 4: Заменить в `components/article-detail-page.tsx`**

Текущий код на строках 186-195:

```tsx
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbItems.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      item: item.href ? `${siteUrl}${localizePath(item.href, locale)}` : articleUrl
    }))
  };
```

Заменить на:

```tsx
  const breadcrumbJsonLd = buildBreadcrumbJsonLd(
    breadcrumbItems.map((item) => ({
      name: item.label,
      url: item.href ? `${siteUrl}${localizePath(item.href, locale)}` : articleUrl
    }))
  );
```

Импорт `buildPublisherJsonLd` из `@/lib/structured-data` уже добавлен в Task 3 — дописать в него `buildBreadcrumbJsonLd`:

```tsx
import { buildBreadcrumbJsonLd, buildPublisherJsonLd } from "@/lib/structured-data";
```

- [ ] **Step 5: Проверить типы и тесты**

Run: `npm run typecheck && npm test`
Expected: без ошибок, все тесты зелёные.

Примечание: `buildBreadcrumbJsonLd` отбрасывает крошки с пустым `label`. Во всех четырёх файлах последняя крошка — это заголовок сущности (`event.name`, имя бойца, `article.title`), который всегда непустой, так что поведение не меняется.

- [ ] **Step 6: Коммит**

```bash
git add app/events/ app/fighters/ app/compare/ components/article-detail-page.tsx
git commit -m "refactor(seo): собрать крошки через общий билдер"
```

---

### Task 10: Полная проверка

- [ ] **Step 1: Прогнать юнит-тесты**

Run: `npm test`
Expected: все тесты проходят, включая пять новых в `structured-data.test.ts`.

- [ ] **Step 2: Собрать проект**

Run: `npm run build`
Expected: сборка завершается успешно.

Смоук-тест не пересобирает приложение — без предшествующего `npm run build` зелёный смоук ничего не подтверждает.

- [ ] **Step 3: Прогнать смоук на свежей сборке**

Run: `npm run test:smoke`
Expected: без ошибок.

- [ ] **Step 4: Проверить разметку в отрендеренном HTML**

Поднять прод-сборку локально (`npm start`) и проверить, что разметка реально попала в HTML:

```bash
curl -s http://localhost:3000/ru | grep -c "SearchAction"
curl -s http://localhost:3000/ru/news | grep -c "BreadcrumbList"
curl -s http://localhost:3000/ru/rankings | grep -c "BreadcrumbList"
curl -s http://localhost:3000/ru/predictions | grep -c "BreadcrumbList"
```

Expected: каждая команда выводит `1`.

- [ ] **Step 5: Проверить валидность JSON-LD**

Скопировать содержимое каждого `<script type="application/ld+json">` с главной, `/ru/news` и любой страницы новости в валидатор https://validator.schema.org/ (или Google Rich Results Test). Expected: 0 ошибок. Для страницы новости отдельно убедиться, что `publisher.logo` присутствует и `NewsArticle` проходит без предупреждения о недостающем логотипе.

- [ ] **Step 6: Финальный коммит и пуш**

```bash
git status
git push origin master
```

Пуш в `origin/master` запускает автодеплой на fightbase.ru. Не пушить, пока Step 1-5 не прошли.

---

## Проверка после деплоя

- [ ] Через 1-2 дня после деплоя — Google Search Console → «Улучшения» → «Навигационные цепочки»: должны появиться пять новых типов страниц.
- [ ] Sitelinks searchbox появляется не мгновенно и не гарантированно — Google решает сам. Отсутствие через неделю не означает ошибку разметки; проверять именно валидность через Rich Results Test.
