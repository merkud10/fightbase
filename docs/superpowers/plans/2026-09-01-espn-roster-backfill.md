# Заполнение карточек бойцов через ESPN — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заполнить зал, размах, рост, фото и возраст у активных бойцов и проспектов, у которых есть `espnId`.

**Architecture:** Логика обогащения через ESPN в проекте уже есть и работает правильно — она просто применяется только к бойцам со скорборда за ±45/60 дней. Выносим её в общий модуль `scripts/espn-enrich.js` и добавляем второй скрипт, который берёт список не со скорборда, а из нашей базы.

**Tech Stack:** Node CommonJS-скрипты в `scripts/`, Prisma, тесты `node:test` + `tsx` (файлы `.ts`, но модули из `scripts/` подключаются через `require`).

**Спека:** `docs/superpowers/specs/2026-09-01-espn-roster-backfill-design.md`

**Ветка:** `feat/espn-roster-backfill` (создана, спека закоммичена)

---

## Важный контекст

**ESPN нужно звать только через `fetch`.** Нодовский `https.get` получает от ESPN 403 по TLS-отпечатку — это уже задокументировано в шапке `sync-espn-roster.js`. Ровно та же беда с ufc.com. Не «упрощать» на `https.get` и не тащить сюда `fetchText` из `fighter-import-utils.js`: он ходит через `https` и получает 403.

**ESPN не отдаёт ударную статистику UFC** (SLpM, точность, тейкдауны). Пустой `sigStrikesLandedPerMin` не должен быть поводом отобрать бойца в бэкфилл — иначе скрипт будет гонять запросы вхолостую и каждый раз считать тех же 131 бойца «недозаполненными».

## Структура файлов

| Файл | Ответственность |
| --- | --- |
| `scripts/espn-enrich.js` | Создать. Общий модуль: `fetchJson`, `enrichFighter`, `needsEspnBackfill`, константы. |
| `scripts/sync-espn-roster.js` | Изменить. Убрать свои копии `fetchJson`/`enrichFighter`/`hasUsablePhoto`, брать их из общего модуля. |
| `scripts/backfill-espn-fighter-data.js` | Создать. Прогон по нашему ростеру. |
| `tests/espn-enrich.test.ts` | Создать. Тесты `needsEspnBackfill`. |
| `lib/db/ufc-athlete-slugs.ts` | Изменить. Исправить неверный комментарий про user-agent. |
| `package.json` | Изменить. Скрипт `content:backfill-espn`. |

---

### Task 1: Общий модуль обогащения

**Files:**
- Create: `scripts/espn-enrich.js`
- Modify: `scripts/sync-espn-roster.js`

Перенос без изменения поведения: тот же код, то же правило записи.

- [ ] **Step 1: Создать общий модуль**

Создать `scripts/espn-enrich.js`:

```js
// Общий модуль обогащения бойцов из ESPN. Используется двумя скриптами:
// sync-espn-roster.js (список со скорборда, свежие и ближайшие бои) и
// backfill-espn-fighter-data.js (список из нашей базы, догоняем остальных).
// Держим в одном месте, чтобы правило записи не разошлось между ними.

const { normalizeCountry } = require("./fighter-import-utils");
const { extractEspnAthleteProfile } = require("./espn-roster-utils");
const { persistImageLocally } = require("./local-image-store");

const ATHLETE_URL = "https://site.web.api.espn.com/apis/common/v3/sports/mma/athletes";
const REQUEST_DELAY_MS = 200;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Встроенный fetch (undici): node https.get ловит 403 от ESPN по
// TLS-фингерпринту, а undici проходит и локально, и с сервера.
async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      Accept: "application/json"
    },
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    throw new Error(`ESPN API HTTP ${response.status} for ${url}`);
  }

  return response.json();
}

function hasUsablePhoto(url) {
  return Boolean(String(url || "").trim());
}

// Поля, которые ESPN действительно отдаёт. Ударной статистики UFC (SLpM,
// точность, тейкдауны) у ESPN нет, поэтому её отсутствие не повод для прогона:
// иначе одни и те же бойцы вечно считались бы недозаполненными.
function needsEspnBackfill(fighter) {
  return (
    !hasUsablePhoto(fighter.photoUrl) ||
    !fighter.heightCm ||
    !fighter.reachCm ||
    !String(fighter.team || "").trim() ||
    !fighter.age
  );
}

async function enrichFighter(prisma, fighter, espnId, dryRun) {
  const payload = await fetchJson(`${ATHLETE_URL}/${espnId}`);
  const profile = extractEspnAthleteProfile(payload);

  const data = { espnId };

  if (profile.record) data.record = profile.record;
  if (profile.age) data.age = profile.age;
  if (profile.heightCm) data.heightCm = profile.heightCm;
  if (profile.reachCm) data.reachCm = profile.reachCm;
  if (profile.koWins !== null) data.winsByKnockout = profile.koWins;
  if (profile.subWins !== null) data.winsBySubmission = profile.subWins;
  if (profile.team) data.team = profile.team;
  if (profile.style) data.style = profile.style;
  if (profile.weightClass) data.weightClass = profile.weightClass;
  if (profile.country) data.country = normalizeCountry(profile.country);

  if (!hasUsablePhoto(fighter.photoUrl) && profile.photoUrl && !dryRun) {
    const localized = await persistImageLocally({
      bucket: "fighters",
      key: fighter.slug,
      sourceUrl: profile.photoUrl
    }).catch(() => null);
    if (localized) {
      data.photoUrl = localized;
    }
  }

  if (dryRun) {
    console.log(`[dry] ${fighter.slug}: ${JSON.stringify(data)}`);
    return;
  }

  await prisma.fighter.update({ where: { id: fighter.id }, data });
}

module.exports = {
  ATHLETE_URL,
  REQUEST_DELAY_MS,
  enrichFighter,
  fetchJson,
  hasUsablePhoto,
  needsEspnBackfill,
  sleep
};
```

- [ ] **Step 2: Переключить sync-espn-roster.js на общий модуль**

В `scripts/sync-espn-roster.js` заменить блок импортов и констант (строки 14–28):

```js
const { PrismaClient } = require("@prisma/client");

const { parseArgs, normalizeCountry } = require("./fighter-import-utils");
const { findExactFighterMatch } = require("./fighter-name-matching");
const { extractEspnAthleteProfile, collectScoreboardCompetitors } = require("./espn-roster-utils");
const { persistImageLocally } = require("./local-image-store");

const prisma = new PrismaClient();

const SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard";
const ATHLETE_URL = "https://site.web.api.espn.com/apis/common/v3/sports/mma/athletes";
const DAYS_BACK = 45;
const DAYS_FORWARD = 60;
const CHUNK_DAYS = 30;
const REQUEST_DELAY_MS = 200;
```

на:

```js
const { PrismaClient } = require("@prisma/client");

const { parseArgs } = require("./fighter-import-utils");
const { findExactFighterMatch } = require("./fighter-name-matching");
const { collectScoreboardCompetitors } = require("./espn-roster-utils");
const { enrichFighter, fetchJson, REQUEST_DELAY_MS, sleep } = require("./espn-enrich");

const prisma = new PrismaClient();

const SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard";
const DAYS_BACK = 45;
const DAYS_FORWARD = 60;
const CHUNK_DAYS = 30;
```

Затем удалить из файла ставшие лишними определения: локальные `sleep`, `fetchJson`, `hasUsablePhoto` и `enrichFighter`.

Наконец, поправить единственный вызов — он теперь принимает `prisma` первым аргументом. Заменить:

```js
      await enrichFighter(fighter, espnId, dryRun);
```

на:

```js
      await enrichFighter(prisma, fighter, espnId, dryRun);
```

- [ ] **Step 3: Проверить синтаксис и что модуль грузится**

Run:
```bash
node --check scripts/espn-enrich.js
node --check scripts/sync-espn-roster.js
node -e "const m=require('./scripts/espn-enrich.js'); console.log(Object.keys(m).join(', '))"
```

Expected: обе проверки молчат, третья печатает
`ATHLETE_URL, REQUEST_DELAY_MS, enrichFighter, fetchJson, hasUsablePhoto, needsEspnBackfill, sleep`.

- [ ] **Step 4: Убедиться, что в sync-espn-roster.js не осталось дублей**

Run: `grep -n "function fetchJson\|function enrichFighter\|function hasUsablePhoto\|function sleep\|normalizeCountry\|persistImageLocally\|extractEspnAthleteProfile\|ATHLETE_URL" scripts/sync-espn-roster.js`

Expected: пусто. Всё это переехало в общий модуль.

- [ ] **Step 5: Commit**

```bash
git add scripts/espn-enrich.js scripts/sync-espn-roster.js
git commit -m "refactor(fighters): общий модуль обогащения через ESPN"
```

---

### Task 2: Тесты отбора кандидатов

**Files:**
- Create: `tests/espn-enrich.test.ts`

- [ ] **Step 1: Написать тесты**

Создать `tests/espn-enrich.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

const { needsEspnBackfill } = require("../scripts/espn-enrich.js");

// Полностью заполненный боец — эталон, от которого отличаются остальные случаи.
function completeFighter() {
  return {
    photoUrl: "/media/fighters/islam-makhachev.png",
    heightCm: 178,
    reachCm: 179,
    team: "Eagles MMA",
    age: 34
  };
}

test("needsEspnBackfill не трогает полностью заполненного бойца", () => {
  assert.equal(needsEspnBackfill(completeFighter()), false);
});

test("needsEspnBackfill отбирает бойца без фото", () => {
  assert.equal(needsEspnBackfill({ ...completeFighter(), photoUrl: null }), true);
});

test("needsEspnBackfill считает пустую строку в фото отсутствием фото", () => {
  assert.equal(needsEspnBackfill({ ...completeFighter(), photoUrl: "   " }), true);
});

test("needsEspnBackfill отбирает бойца с нулевым ростом", () => {
  assert.equal(needsEspnBackfill({ ...completeFighter(), heightCm: 0 }), true);
});

test("needsEspnBackfill отбирает бойца с нулевым размахом", () => {
  assert.equal(needsEspnBackfill({ ...completeFighter(), reachCm: 0 }), true);
});

test("needsEspnBackfill отбирает бойца с пустым залом", () => {
  assert.equal(needsEspnBackfill({ ...completeFighter(), team: "" }), true);
});

test("needsEspnBackfill отбирает бойца с нулевым возрастом", () => {
  assert.equal(needsEspnBackfill({ ...completeFighter(), age: 0 }), true);
});

// ESPN не отдаёт ударную статистику UFC. Если считать её отсутствие поводом для
// прогона, скрипт будет вечно гонять одних и тех же бойцов вхолостую.
test("needsEspnBackfill игнорирует отсутствие ударной статистики UFC", () => {
  const fighter = { ...completeFighter(), sigStrikesLandedPerMin: null, strikeAccuracy: null };
  assert.equal(needsEspnBackfill(fighter), false);
});
```

- [ ] **Step 2: Запустить тесты**

Run: `node --import tsx --test tests/espn-enrich.test.ts`

Expected: PASS, 8 тестов.

- [ ] **Step 3: Commit**

```bash
git add tests/espn-enrich.test.ts
git commit -m "test(fighters): отбор кандидатов на обогащение из ESPN"
```

---

### Task 3: Скрипт бэкфилла по ростеру

**Files:**
- Create: `scripts/backfill-espn-fighter-data.js`
- Modify: `package.json`

- [ ] **Step 1: Написать скрипт**

Создать `scripts/backfill-espn-fighter-data.js`:

```js
#!/usr/bin/env node

// Догоняет карточки бойцов данными ESPN, беря список из нашей базы.
//
// Отличие от sync-espn-roster.js: тот берёт участников со скорборда ESPN за
// окно ±45/60 дней, поэтому боец, который давно не выступал и скоро не
// выступает, не обогащается никогда. Здесь список — наш ростер.
//
// Запуск: node scripts/backfill-espn-fighter-data.js [--dry-run] [--limit N] [--status active,prospect]

const { PrismaClient } = require("@prisma/client");

const { parseArgs } = require("./fighter-import-utils");
const { enrichFighter, needsEspnBackfill, REQUEST_DELAY_MS, sleep } = require("./espn-enrich");

const prisma = new PrismaClient();

const DEFAULT_STATUSES = ["active", "prospect"];

function parseStatuses(value) {
  if (typeof value !== "string" || !value.trim()) return DEFAULT_STATUSES;

  const statuses = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return statuses.length > 0 ? statuses : DEFAULT_STATUSES;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const limit = Number(args.limit || 0) || null;
  const dryRun = Boolean(args["dry-run"]) || String(args.dry || "") === "true";
  const statuses = parseStatuses(args.status);

  const fighters = await prisma.fighter.findMany({
    where: {
      status: { in: statuses },
      espnId: { not: null }
    },
    select: {
      id: true,
      slug: true,
      name: true,
      espnId: true,
      photoUrl: true,
      heightCm: true,
      reachCm: true,
      team: true,
      age: true,
      updatedAt: true
    }
  });

  // Сначала самые залежавшиеся профили — чтобы лимит расходовался с пользой.
  const backlog = fighters
    .filter(needsEspnBackfill)
    .sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt));
  const batch = limit ? backlog.slice(0, limit) : backlog;

  console.log(
    `Статусы: ${statuses.join(", ")}. С espnId: ${fighters.length}, требуют обогащения: ${backlog.length}, в партии: ${batch.length}${dryRun ? " (сухой прогон)" : ""}`
  );

  let ok = 0;
  let failed = 0;

  for (const fighter of batch) {
    try {
      await enrichFighter(prisma, fighter, fighter.espnId, dryRun);
      ok += 1;
    } catch (error) {
      failed += 1;
      console.warn(`[ошибка] ${fighter.slug}: ${error.message || error}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  console.log("");
  console.log(`Итог: обогащено=${ok} ошибок=${failed}${dryRun ? " (сухой прогон)" : ""}`);

  // Полный провал при непустой партии — повод уронить job: значит ESPN лёг.
  if (batch.length > 0 && ok === 0) {
    process.exit(1);
  }
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 2: Добавить npm-скрипт**

В `package.json` дописать рядом с `content:backfill-slug-aliases`:

```json
"content:backfill-espn": "node scripts/backfill-espn-fighter-data.js",
```

- [ ] **Step 3: Проверить синтаксис**

Run:
```bash
node --check scripts/backfill-espn-fighter-data.js
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json валиден')"
```

Expected: проверка молчит, второй вывод — `package.json валиден`.

- [ ] **Step 4: Commit**

```bash
git add scripts/backfill-espn-fighter-data.js package.json
git commit -m "feat(fighters): бэкфилл карточек из ESPN по нашему ростеру"
```

---

### Task 4: Исправить неверный комментарий

**Files:**
- Modify: `lib/db/ufc-athlete-slugs.ts`

Комментарий утверждает, что 403 вызывает браузерный user-agent. Это неверно: тот 403 был следствием частых запросов, а отказы дают транспорт и география.

- [ ] **Step 1: Переписать комментарий**

В `lib/db/ufc-athlete-slugs.ts` заменить:

```ts
// Cloudflare на ufc.com отдаёт 403 на реалистичный браузерный user-agent и
// пропускает вот этот. Тот же заголовок используется в lib/ufc-rankings.ts.
// Не менять.
const UFC_USER_AGENT = "Mozilla/5.0 FightBase/1.0";
```

на:

```ts
// Тот же заголовок, что в lib/ufc-rankings.ts — держим их одинаковыми.
// Важнее заголовка транспорт: запрос обязан идти через fetch (undici).
// Нодовский https.get и curl Cloudflare отбивает по TLS-отпечатку — проверено
// на проде 01.09.2026: один и тот же user-agent, https.get даёт 403, fetch 200.
// Частые запросы подряд тоже ловят 403, поэтому резолв идёт с задержкой.
const UFC_USER_AGENT = "Mozilla/5.0 FightBase/1.0";
```

- [ ] **Step 2: Проверить типы**

Run: `npm run typecheck`

Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add lib/db/ufc-athlete-slugs.ts
git commit -m "docs(rankings): уточнить настоящую причину отказов ufc.com"
```

---

### Task 5: Прогон и проверка на проде

**Files:** изменений в коде нет

- [ ] **Step 1: Прогнать тесты и сборку локально**

Run:
```bash
npm test
npm run build
```

Expected: всё зелёное.

- [ ] **Step 2: Замерить исходное состояние**

Чтобы не воевать с экранированием кавычек через ssh, кладём запрос файлом на
сервер и зовём его. Пароль читается из `.env`, в команде не светится.

```bash
ssh -i ~/.ssh/fightbase_deploy root@fightbase.ru 'cat > /tmp/gaps.sql <<SQL
SELECT count(*) FILTER (WHERE "photoUrl" IS NULL) AS no_photo,
       count(*) FILTER (WHERE "heightCm" = 0)     AS no_h,
       count(*) FILTER (WHERE "reachCm" = 0)      AS no_r,
       count(*) FILTER (WHERE team = %%)          AS no_team,
       count(*) FILTER (WHERE age = 0)            AS no_age,
       count(*) FILTER (WHERE "sigStrikesLandedPerMin" IS NULL) AS no_ufc_stats
FROM "Fighter"
WHERE status IN (%%active%%, %%prospect%%) AND "espnId" IS NOT NULL;
SQL
sed -i "s/%%/'"'"'/g" /tmp/gaps.sql
cd /opt/fightbase
export PGPASSWORD=$(sed -nE "s#.*postgresql://[^:]+:([^@]+)@.*#\1#p" .env | head -1)
psql -h 127.0.0.1 -U fightbase -d fightbase -f /tmp/gaps.sql'
```

(`%%` — заглушка под одинарную кавычку, которую `sed` подставляет уже на
сервере; так heredoc не приходится экранировать через два уровня оболочки.)

Ожидаемое исходное: `no_photo 57, no_h 92, no_r 123, no_team 242, no_age 37, no_ufc_stats 131`.

- [ ] **Step 3: Слить и задеплоить**

```bash
git checkout master
git merge --no-ff feat/espn-roster-backfill
git push origin master
```

Дождаться деплоя: `curl -s -o /dev/null -w "%{http_code}\n" https://fightbase.ru/ru/rankings` возвращает `200`.

- [ ] **Step 4: Сухой прогон на проде**

```bash
ssh -i ~/.ssh/fightbase_deploy root@fightbase.ru "cd /opt/fightbase && npm run content:backfill-espn -- --dry-run --limit 10"
```

Expected: десять строк вида `[dry] slug: {"espnId":"...","team":"...","heightCm":178,...}`. Глазами проверить, что значения осмысленные: имена залов настоящие, рост в разумных пределах, страна не мусор. **Если в выводе видны русские имена или мусорные значения — остановиться и разобраться, не запускать боевой прогон.**

- [ ] **Step 5: Боевой прогон**

```bash
ssh -i ~/.ssh/fightbase_deploy root@fightbase.ru "cd /opt/fightbase && npm run content:backfill-espn"
```

Expected: в конце `Итог: обогащено=N ошибок=M`, где N составляет заметную долю партии.

- [ ] **Step 6: Повторный замер**

Файл `/tmp/gaps.sql` уже лежит на сервере, поэтому достаточно:

```bash
ssh -i ~/.ssh/fightbase_deploy root@fightbase.ru 'cd /opt/fightbase && export PGPASSWORD=$(sed -nE "s#.*postgresql://[^:]+:([^@]+)@.*#\1#p" .env | head -1) && psql -h 127.0.0.1 -U fightbase -d fightbase -f /tmp/gaps.sql'
```

Expected: `no_photo`, `no_h`, `no_r`, `no_team`, `no_age` заметно упали. `no_ufc_stats` **не изменился** — ESPN эту статистику не отдаёт, это ожидаемо и не является провалом.

- [ ] **Step 7: Проверить картинки**

Свежие фото кладутся в `public/media/fighters/`, а Next не видит новые файлы в `public/` до перезапуска:

```bash
ssh -i ~/.ssh/fightbase_deploy root@fightbase.ru "systemctl restart fightbase"
```

Затем открыть карточку любого бойца, у которого появилось фото, и убедиться, что картинка отдаётся.

---

## Что осознанно не делается

**Ударная статистика UFC** (SLpM, точность, тейкдауны) — у ESPN её нет, а UFC.com для дата-центров закрыт и отдаёт русскую версию. Отдельная задача со своим исследованием.

**112 активных бойцов без `espnId`** — привязка требует поиска по ESPN и разбора неоднозначных совпадений, где легко привязать не того. Отдельная задача.

**Завершившие карьеру** (1665 бойцов) — по решению пользователя первый заход только по тем, кого читают. Скрипт умеет `--status retired`, так что запустить можно в любой момент.
