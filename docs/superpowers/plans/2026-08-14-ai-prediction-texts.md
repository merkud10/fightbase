# AI-тексты прогнозных снапшотов — план имплементации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить шаблонные текстовые блоки прогнозных снапшотов на уникальные AI-разборы из фактов базы, с валидацией, фоллбэком на шаблоны и хэш-гейтом против ежедневной перезаписи.

**Architecture:** Существующий `expandRuSnapshotWithDeepSeek` в `scripts/generate-prediction-snapshots.js` (бедный промпт, нет валидации, молчаливый фоллбэк, нет кэша) заменяется модулем `scripts/prediction-ai-copy.js`: факт-пакет → промпт «пиши из фактов» → строгий JSON → четырёхступенчатая валидация → хэш-гейт в двух новых колонках `FightPredictionSnapshot`. Красные флаги выносятся из `generate-ai-predictions.js` в общий `scripts/ai-text-quality.js`.

**Tech Stack:** Node CJS-скрипты, Prisma (Postgres), DeepSeek chat/completions API, node:test + tsx.

Спека: `docs/superpowers/specs/2026-08-14-ai-prediction-texts-design.md`.

---

### Task 1: Общий модуль качества AI-текста

**Files:**
- Create: `scripts/ai-text-quality.js`
- Modify: `scripts/generate-ai-predictions.js` (строки 64–90: RED_FLAG_RULES, collectRedFlags, enforceNameCorrections — заменить на require)
- Test: `tests/ai-text-quality.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { collectRedFlags, enforceNameCorrections, latinShare } = require("../scripts/ai-text-quality.js");

test("collectRedFlags detects leftover English MMA terms", () => {
  assert.deepEqual(collectRedFlags("Он выступает в дивизионе featherweight"), ["raw_weight_class_english"]);
  assert.deepEqual(collectRedFlags("Чистый русский текст о бое."), []);
});

test("enforceNameCorrections fixes the known bad name variant", () => {
  assert.equal(enforceNameCorrections("Чрис Кёртис победил"), "Крис Кёртис победил");
});

test("latinShare computes the latin-letter fraction", () => {
  assert.equal(latinShare("абвг"), 0);
  assert.equal(latinShare("abcd"), 1);
  assert.ok(Math.abs(latinShare("абab") - 0.5) < 1e-9);
  assert.equal(latinShare(""), 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/ai-text-quality.test.ts`
Expected: FAIL — `Cannot find module '../scripts/ai-text-quality.js'`

- [ ] **Step 3: Write the module**

Создать `scripts/ai-text-quality.js`. RED_FLAG_RULES и enforceNameCorrections — перенести
ДОСЛОВНО из `scripts/generate-ai-predictions.js` (строки 64–90, включая юникод-паттерны),
добавить latinShare и экспорт:

```js
const RED_FLAG_RULES = [ /* дословно из generate-ai-predictions.js:64-77 */ ];

function collectRedFlags(value) {
  return RED_FLAG_RULES.filter((rule) => rule.pattern.test(String(value || ""))).map((rule) => rule.label);
}

function enforceNameCorrections(value) { /* дословно из generate-ai-predictions.js:83-90 */ }

function latinShare(value) {
  const text = String(value || "");
  const cyrillic = (text.match(/[А-Яа-яЁё]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  const total = cyrillic + latin;
  return total === 0 ? 0 : latin / total;
}

module.exports = { RED_FLAG_RULES, collectRedFlags, enforceNameCorrections, latinShare };
```

В `scripts/generate-ai-predictions.js` удалить локальные RED_FLAG_RULES/collectRedFlags/
enforceNameCorrections и добавить вверху:

```js
const { collectRedFlags, enforceNameCorrections } = require("./ai-text-quality");
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --import tsx --test tests/ai-text-quality.test.ts` → PASS
Run: `node --check scripts/generate-ai-predictions.js` → без ошибок
Run: `npm run test` → все зелёные

- [ ] **Step 5: Commit**

```bash
git add scripts/ai-text-quality.js scripts/generate-ai-predictions.js tests/ai-text-quality.test.ts
git commit -m "refactor: extract shared AI text quality checks"
```

### Task 2: Факт-пакет и хэш

**Files:**
- Create: `scripts/prediction-ai-copy.js`
- Test: `tests/prediction-ai-copy.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildFightFactPack, computeAiContentHash } = require("../scripts/prediction-ai-copy.js");

function makeFighter(overrides = {}) {
  return {
    id: "f-a",
    name: "Islam Makhachev",
    nameRu: "Ислам Махачев",
    record: "28-1-0",
    sigStrikesLandedPerMin: 2.45,
    strikeAccuracy: 58,
    strikeDefense: 62,
    takedownAveragePer15: 3.1,
    takedownDefense: 91,
    submissionAveragePer15: 0.98,
    recentFights: [
      { opponentName: "Jack Della Maddalena", opponentNameRu: "Джек Делла Маддалена", result: "win", method: "unanimous decision" }
    ],
    ...overrides
  };
}

function makeFight(overrides = {}) {
  return {
    id: "fight-1",
    eventId: "event-1",
    weightClass: "Welterweight",
    isMainEvent: true,
    stage: "main",
    fighterA: makeFighter(),
    fighterB: makeFighter({ id: "f-b", name: "Ian Machado Garry", nameRu: "Иан Мачадо Гарри", record: "17-1-0", recentFights: [] }),
    event: { name: "UFC 330: Makhachev vs. Machado Garry", date: new Date("2026-08-16T00:00:00Z"), slug: "ufc-330" },
    ...overrides
  };
}

test("buildFightFactPack keeps only filled stats and marks the card slot", () => {
  const pack = buildFightFactPack(makeFight(), { percentA: 71, percentB: 29, source: "odds" });
  assert.equal(pack.isHeadliner, true);
  assert.equal(pack.fighters[0].name, "Ислам Махачев");
  assert.equal(pack.fighters[0].record, "28-1-0");
  assert.equal(pack.fighters[0].stats.takedownDefense, 91);
  assert.equal(pack.fighters[1].recentFights.length, 0);
  assert.equal(pack.percentA, 71);
  const sparse = buildFightFactPack(
    makeFight({ fighterA: makeFighter({ sigStrikesLandedPerMin: null, strikeAccuracy: null, strikeDefense: null, takedownAveragePer15: null, takedownDefense: null, submissionAveragePer15: null }) }),
    { percentA: 50, percentB: 50, source: "base" }
  );
  assert.deepEqual(sparse.fighters[0].stats, {});
});

test("computeAiContentHash is stable and reacts to opponent and percent-band changes", () => {
  const fight = makeFight();
  const h1 = computeAiContentHash(fight, { percentA: 71 });
  const h2 = computeAiContentHash(fight, { percentA: 74 });
  assert.equal(h1, h2); // 71 и 74 в одной полосе (округление к 70)
  const h3 = computeAiContentHash(fight, { percentA: 66 });
  assert.notEqual(h1, h3); // сменилась полоса 70 -> 70? нет: 66 округляется к 70... поэтому берём 55
  const h4 = computeAiContentHash(fight, { percentA: 55 });
  assert.notEqual(h1, h4);
  const h5 = computeAiContentHash(makeFight({ fighterB: makeFighter({ id: "f-c" }) }), { percentA: 71 });
  assert.notEqual(h1, h5);
});
```

Примечание: в тесте полос выше оставить только пары с разными округлениями
(71→70, 74→70, 55→60): `h1 === h2`, `h1 !== h4`, `h1 !== h5`. Строку с 66 не писать.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --import tsx --test tests/prediction-ai-copy.test.ts`
Expected: FAIL — `Cannot find module '../scripts/prediction-ai-copy.js'`

- [ ] **Step 3: Write the implementation**

`scripts/prediction-ai-copy.js`:

```js
const crypto = require("node:crypto");

function pickName(fighter) {
  return String(fighter?.nameRu || fighter?.name || "").trim();
}

function buildFighterFacts(fighter) {
  const stats = {};
  if (fighter.sigStrikesLandedPerMin != null) stats.sigStrikesLandedPerMin = Number(fighter.sigStrikesLandedPerMin.toFixed(2));
  if (fighter.strikeAccuracy != null) stats.strikeAccuracy = Math.round(fighter.strikeAccuracy);
  if (fighter.strikeDefense != null) stats.strikeDefense = Math.round(fighter.strikeDefense);
  if (fighter.takedownAveragePer15 != null) stats.takedownAverage = Number(fighter.takedownAveragePer15.toFixed(2));
  if (fighter.takedownDefense != null) stats.takedownDefense = Math.round(fighter.takedownDefense);
  if (fighter.submissionAveragePer15 != null) stats.submissionAverage = Number(fighter.submissionAveragePer15.toFixed(2));

  return {
    name: pickName(fighter),
    record: String(fighter.record || "").trim() || null,
    stats,
    recentFights: (fighter.recentFights || []).slice(0, 3).map((entry) => ({
      opponent: String(entry.opponentNameRu || entry.opponentName || "").trim(),
      result: entry.result || null,
      method: entry.method || null
    }))
  };
}

function buildFightFactPack(fight, percents) {
  return {
    eventName: String(fight.event?.name || "").trim(),
    eventDate: fight.event?.date
      ? new Date(fight.event.date).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })
      : null,
    weightClass: String(fight.weightClass || "").trim(),
    isHeadliner: Boolean(fight.isMainEvent),
    cardStage: String(fight.stage || "").trim() || null,
    fighters: [buildFighterFacts(fight.fighterA), buildFighterFacts(fight.fighterB)],
    percentA: percents?.percentA ?? null,
    percentB: percents?.percentB ?? null,
    percentSource: percents?.source ?? null
  };
}

function computeAiContentHash(fight, percents) {
  const band = percents?.percentA == null ? "na" : String(Math.round(percents.percentA / 10) * 10);
  const raw = [fight.fighterA?.id, fight.fighterB?.id, fight.eventId, band].join("|");
  return crypto.createHash("sha256").update(raw).digest("hex");
}

module.exports = { buildFightFactPack, computeAiContentHash };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --import tsx --test tests/prediction-ai-copy.test.ts` → PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/prediction-ai-copy.js tests/prediction-ai-copy.test.ts
git commit -m "feat: fight fact pack and content hash for AI prediction copy"
```

### Task 3: Промпт и валидатор

**Files:**
- Modify: `scripts/prediction-ai-copy.js`
- Test: `tests/prediction-ai-copy.test.ts` (дописать)

- [ ] **Step 1: Write the failing tests** (дописать в существующий файл; makeFight/makeFighter уже есть)

```ts
const { buildPrompt, validateAiCopy } = require("../scripts/prediction-ai-copy.js");

function validCopy() {
  return {
    overview: "Ислам Махачев подходит к бою фаворитом за счет давления и борьбы. Иан Мачадо Гарри строит бой от джеба и дистанции, и его шансы связаны с тем, удастся ли удержать поединок в стойке.",
    keyEdge: "Ключевая разница — борьба: 3.1 перевода за бой против скромной защиты соперника.",
    fightScript: "Первый раунд пройдет в разведке, дальше давление у сетки и попытки перевода.",
    pathA: "Перевод и контроль в партере до финиша или решения.",
    pathB: "Держать дистанцию, набирать очки джебом и защищаться от тейкдаунов."
  };
}

test("buildPrompt asks for strict JSON and embeds only pack facts", () => {
  const pack = buildFightFactPack(makeFight(), { percentA: 71, percentB: 29, source: "odds" });
  const prompt = buildPrompt(pack);
  assert.ok(prompt.system.includes("JSON"));
  assert.ok(prompt.user.includes("Ислам Махачев"));
  assert.ok(prompt.user.includes("28-1-0"));
});

test("validateAiCopy accepts a clean copy", () => {
  const pack = buildFightFactPack(makeFight(), { percentA: 71, percentB: 29, source: "odds" });
  const result = validateAiCopy(validCopy(), pack);
  assert.equal(result.ok, true);
});

test("validateAiCopy rejects missing fields, latin text, banned lexicon and foreign numbers", () => {
  const pack = buildFightFactPack(makeFight(), { percentA: 71, percentB: 29, source: "odds" });
  assert.equal(validateAiCopy({ ...validCopy(), pathB: "" }, pack).ok, false);
  assert.equal(validateAiCopy({ ...validCopy(), overview: "Islam Makhachev is the pressure fighter here and controls every grappling exchange." }, pack).ok, false);
  assert.equal(validateAiCopy({ ...validCopy(), keyEdge: "Букмекеры дают низкий коэффициент, ставка зайдет." }, pack).ok, false);
  const foreign = validateAiCopy({ ...validCopy(), keyEdge: "Он выиграл 47 боев подряд и нанес 9999 ударов." }, pack);
  assert.equal(foreign.ok, false);
  assert.equal(foreign.reason, "foreign_numbers");
});

test("validateAiCopy allows round numbers 1-5 and numbers present in the pack", () => {
  const pack = buildFightFactPack(makeFight(), { percentA: 71, percentB: 29, source: "odds" });
  const copy = { ...validCopy(), fightScript: "Со 2 раунда Ислам Махачев начнет проводить по 3.1 перевода, реализуя 71 процент своих шансов." };
  assert.equal(validateAiCopy(copy, pack).ok, true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --import tsx --test tests/prediction-ai-copy.test.ts`
Expected: FAIL — `buildPrompt is not a function`

- [ ] **Step 3: Write the implementation** (дописать в `scripts/prediction-ai-copy.js`)

```js
const { collectRedFlags, enforceNameCorrections, latinShare } = require("./ai-text-quality");

const COPY_FIELDS = ["overview", "keyEdge", "fightScript", "pathA", "pathB"];
const BANNED_LEXICON = /букмекер|котировк|коэффициент|ставк|зайд[её]т|экспресс|беттинг/i;

function buildPrompt(pack) {
  const system = [
    "Ты — редактор русскоязычного MMA-медиа. Пишешь сухие, точные редакционные разборы боев UFC.",
    "Верни СТРОГО валидный JSON без пояснений и markdown, с ключами: overview, keyEdge, fightScript, pathA, pathB. Все значения — строки на русском языке.",
    "Имена бойцов используй только в именительном падеже, чтобы не ошибаться в склонениях: перестраивай фразу, а не склоняй имя.",
    "Запрещено упоминать букмекеров, ставки, коэффициенты и давать советы по ставкам.",
    "Запрещено использовать любые факты и числа, которых нет во входных данных: не выдумывай травмы, цитаты, титулы и историю встреч.",
    "Если данных мало — пиши короче, без воды."
  ].join("\n");

  const targetWords = pack.isHeadliner ? "120-160" : "60-90";
  const user = [
    `Целевая длина каждого поля: ${targetWords} слов.`,
    "Поля: overview — общая картина матчапа; keyEdge — главное преимущество и за кем оно; fightScript — вероятное развитие боя; pathA — путь к победе первого бойца; pathB — путь к победе второго.",
    "",
    "Факты (используй только их):",
    JSON.stringify(pack, null, 1)
  ].join("\n");

  return { system, user };
}

function extractNumbers(text) {
  return (String(text || "").match(/\d+(?:[.,]\d+)?/g) || []).map((token) => token.replace(",", "."));
}

function validateAiCopy(parsed, pack) {
  if (!parsed || typeof parsed !== "object") return { ok: false, reason: "not_an_object" };

  const copy = {};
  for (const field of COPY_FIELDS) {
    const value = typeof parsed[field] === "string" ? enforceNameCorrections(parsed[field].trim()) : "";
    if (!value) return { ok: false, reason: `empty_${field}` };
    copy[field] = value;
  }

  const combined = COPY_FIELDS.map((field) => copy[field]).join("\n");
  if (latinShare(combined) > 0.1) return { ok: false, reason: "latin_share" };
  if (collectRedFlags(combined).length > 0) return { ok: false, reason: "red_flags" };
  if (BANNED_LEXICON.test(combined)) return { ok: false, reason: "banned_lexicon" };

  const allowed = new Set(extractNumbers(JSON.stringify(pack)));
  for (const part of ["1", "2", "3", "4", "5"]) allowed.add(part);
  for (const record of pack.fighters.map((f) => f.record).filter(Boolean)) {
    for (const chunk of record.split("-")) allowed.add(String(Number(chunk)));
  }
  const foreign = extractNumbers(combined).filter((token) => !allowed.has(token) && !allowed.has(String(Number(token))));
  if (foreign.length > 0) return { ok: false, reason: "foreign_numbers" };

  const [minWords, maxWords] = pack.isHeadliner ? [70, 280] : [38, 150];
  const totalWords = combined.split(/\s+/).filter(Boolean).length;
  const perFieldAverage = totalWords / COPY_FIELDS.length;
  if (perFieldAverage < minWords * 0.3 || perFieldAverage > maxWords) return { ok: false, reason: "length" };

  return { ok: true, copy };
}
```

Добавить `buildPrompt`, `validateAiCopy` в `module.exports`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --import tsx --test tests/prediction-ai-copy.test.ts` → PASS (все, включая Task 2)

- [ ] **Step 5: Commit**

```bash
git add scripts/prediction-ai-copy.js tests/prediction-ai-copy.test.ts
git commit -m "feat: prompt builder and validator for AI prediction copy"
```

### Task 4: Генерация с ретраями

**Files:**
- Modify: `scripts/prediction-ai-copy.js`
- Test: `tests/prediction-ai-copy.test.ts` (дописать)

- [ ] **Step 1: Write the failing tests**

```ts
const { generateAiPredictionCopy } = require("../scripts/prediction-ai-copy.js");

function okResponse(body: unknown) {
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(body) } }] })
  };
}

test("generateAiPredictionCopy returns validated copy on success", async () => {
  const calls: unknown[] = [];
  const result = await generateAiPredictionCopy({
    fight: makeFight(),
    percents: { percentA: 71, percentB: 29, source: "odds" },
    config: { apiKey: "k", baseUrl: "https://api.example", model: "m", retryDelayMs: 1 },
    fetchImpl: async (...args: unknown[]) => { calls.push(args); return okResponse(validCopy()); }
  });
  assert.equal(result?.copy.overview.startsWith("Ислам Махачев"), true);
  assert.equal(calls.length, 1);
});

test("generateAiPredictionCopy retries HTTP errors and gives up with null", async () => {
  let attempts = 0;
  const result = await generateAiPredictionCopy({
    fight: makeFight(),
    percents: { percentA: 71, percentB: 29, source: "odds" },
    config: { apiKey: "k", baseUrl: "https://api.example", model: "m", retryDelayMs: 1 },
    fetchImpl: async () => { attempts += 1; return { ok: false, status: 500 }; }
  });
  assert.equal(result, null);
  assert.equal(attempts, 3);
});

test("generateAiPredictionCopy returns null on invalid model JSON without retrying validation", async () => {
  const result = await generateAiPredictionCopy({
    fight: makeFight(),
    percents: { percentA: 71, percentB: 29, source: "odds" },
    config: { apiKey: "k", baseUrl: "https://api.example", model: "m", retryDelayMs: 1 },
    fetchImpl: async () => okResponse({ overview: "" })
  });
  assert.equal(result, null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --import tsx --test tests/prediction-ai-copy.test.ts`
Expected: FAIL — `generateAiPredictionCopy is not a function`

- [ ] **Step 3: Write the implementation** (дописать в `scripts/prediction-ai-copy.js`)

```js
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseModelJson(content) {
  const raw = String(content || "").trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const sanitized = fenced?.[1]?.trim() ?? raw;
  try {
    return JSON.parse(sanitized);
  } catch {
    const start = sanitized.indexOf("{");
    const end = sanitized.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(sanitized.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

const MAX_ATTEMPTS = 3;

async function generateAiPredictionCopy({ fight, percents, config, fetchImpl = fetch }) {
  const pack = buildFightFactPack(fight, percents);
  const prompt = buildPrompt(pack);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        signal: AbortSignal.timeout(config.timeoutMs ?? 30000),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          temperature: 0.4,
          messages: [
            { role: "system", content: prompt.system },
            { role: "user", content: prompt.user }
          ]
        })
      });
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) return null;
      await sleep((config.retryDelayMs ?? 2000) * attempt);
      continue;
    }

    if (!response.ok) {
      if (attempt === MAX_ATTEMPTS) return null;
      await sleep((config.retryDelayMs ?? 2000) * attempt);
      continue;
    }

    const payload = await response.json();
    const parsed = parseModelJson(payload?.choices?.[0]?.message?.content);
    const verdict = validateAiCopy(parsed, pack);
    if (!verdict.ok) {
      return null; // невалидный контент не ретраим: причина детерминированная
    }
    return { copy: verdict.copy, pack };
  }

  return null;
}
```

Добавить `generateAiPredictionCopy` в `module.exports`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --import tsx --test tests/prediction-ai-copy.test.ts` → PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/prediction-ai-copy.js tests/prediction-ai-copy.test.ts
git commit -m "feat: DeepSeek call with retries for AI prediction copy"
```

### Task 5: Миграция aiContentHash/aiGeneratedAt

**Files:**
- Modify: `prisma/schema.postgres.prisma` (model FightPredictionSnapshot, после statLines-полей)
- Modify: `prisma/schema.prisma` (та же модель)
- Create: `prisma/migrations/20260814120000_add_snapshot_ai_fields/migration.sql`

- [ ] **Step 1: Add fields to both schemas**

В обеих схемах в model FightPredictionSnapshot добавить:

```prisma
  aiContentHash     String?
  aiGeneratedAt     DateTime?
```

- [ ] **Step 2: Write the migration SQL**

`prisma/migrations/20260814120000_add_snapshot_ai_fields/migration.sql`:

```sql
ALTER TABLE "FightPredictionSnapshot"
ADD COLUMN "aiContentHash" TEXT,
ADD COLUMN "aiGeneratedAt" TIMESTAMP(3);
```

- [ ] **Step 3: Regenerate client and typecheck**

Run: `npm run prisma:generate:pg` → успех
Run: `npm run typecheck` → без ошибок

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.postgres.prisma prisma/schema.prisma prisma/migrations/20260814120000_add_snapshot_ai_fields
git commit -m "feat: ai content hash fields on prediction snapshots"
```

### Task 6: Интеграция в генератор снапшотов

**Files:**
- Modify: `scripts/generate-prediction-snapshots.js`

- [ ] **Step 1: Удалить старый механизм**

Удалить целиком `isDeepSeekEnabled` и `expandRuSnapshotWithDeepSeek` (строки 53–148)
и их вызов `const ru = await expandRuSnapshotWithDeepSeek(fight, baseRu);` (строка 570).

- [ ] **Step 2: Подключить модуль и конфиг**

Вверху файла:

```js
const { computeAiContentHash, generateAiPredictionCopy } = require("./prediction-ai-copy");

function getAiCopyConfig() {
  if (readEnv("PREDICTION_AI_COPY", "1").trim() === "0") return null;
  if (readEnv("AI_PROVIDER", "").trim().toLowerCase() !== "deepseek") return null;
  const apiKey = readEnv("DEEPSEEK_API_KEY", "").trim();
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: readEnv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
    model: readEnv("DEEPSEEK_MODEL", "deepseek-chat").trim()
  };
}
```

- [ ] **Step 3: Хэш-гейт в main()**

После `const eligibleFightIds = ...` добавить выборку существующих снапшотов:

```js
  const existingSnapshots = new Map(
    (
      await prisma.fightPredictionSnapshot.findMany({
        where: { fightId: { in: eligibleFightIds } },
        select: {
          fightId: true,
          aiContentHash: true,
          aiGeneratedAt: true,
          excerptRu: true,
          overviewRu: true,
          keyEdgeRu: true,
          fightScriptRu: true,
          pathARu: true,
          pathBRu: true
        }
      })
    ).map((snapshot) => [snapshot.fightId, snapshot])
  );

  const aiConfig = getAiCopyConfig();
  let aiGeneratedCount = 0;
  let aiReusedCount = 0;
  let aiFallbackCount = 0;
```

Цикл по боям заменить на:

```js
  for (const fight of fights) {
    const baseRu = normalizeRuSnapshot(buildSnapshotCopy("ru", fight));
    const en = buildSnapshotCopy("en", fight);
    let ru = baseRu;
    let aiContentHash = null;
    let aiGeneratedAt = null;

    if (aiConfig) {
      const odds = { oddsA: fight.oddsA ?? null, oddsB: fight.oddsB ?? null };
      const percents = getFightWinPercentages(fight.fighterA, fight.fighterB, odds);
      const nextHash = computeAiContentHash(fight, percents);
      const existing = existingSnapshots.get(fight.id);

      if (existing?.aiContentHash === nextHash && existing.aiGeneratedAt) {
        ru = {
          ...baseRu,
          excerpt: existing.excerptRu,
          overview: existing.overviewRu,
          keyEdge: existing.keyEdgeRu,
          fightScript: existing.fightScriptRu,
          pathA: existing.pathARu,
          pathB: existing.pathBRu
        };
        aiContentHash = existing.aiContentHash;
        aiGeneratedAt = existing.aiGeneratedAt;
        aiReusedCount += 1;
      } else {
        const generated = await generateAiPredictionCopy({ fight, percents, config: aiConfig });
        if (generated) {
          const fighterAName = getDisplayName(fight.fighterA, "ru");
          const fighterBName = getDisplayName(fight.fighterB, "ru");
          ru = normalizeRuSnapshot({
            ...baseRu,
            ...generated.copy,
            excerpt: `Подробный прогноз на бой ${fighterAName} — ${fighterBName}: ${generated.copy.overview}`
          });
          aiContentHash = nextHash;
          aiGeneratedAt = new Date();
          aiGeneratedCount += 1;
        } else {
          aiFallbackCount += 1;
          console.warn(`[ai-copy] fallback to template: ${fight.event.slug} | ${fight.fighterA.name} vs ${fight.fighterB.name}`);
        }
      }
    }
```

В payload добавить два поля:

```js
      aiContentHash,
      aiGeneratedAt,
```

- [ ] **Step 4: Dry-run печатает тексты**

Блок dry-run заменить на:

```js
    if (options.dryRun) {
      console.log(`[dry-run] ${fight.event.slug} | ${fight.fighterA.name} vs ${fight.fighterB.name}${aiGeneratedAt ? " | AI" : " | template"}`);
      if (aiGeneratedAt) {
        console.log(`  overview: ${ru.overview}`);
        console.log(`  keyEdge: ${ru.keyEdge}`);
        console.log(`  fightScript: ${ru.fightScript}`);
        console.log(`  pathA: ${ru.pathA}`);
        console.log(`  pathB: ${ru.pathB}`);
      }
      continue;
    }
```

- [ ] **Step 5: Итоги прогона и системное событие**

После цикла, перед итоговым console.log, добавить:

```js
  const aiAttempted = aiGeneratedCount + aiFallbackCount;
  if (aiConfig) {
    console.log(`AI copy: generated ${aiGeneratedCount}, reused ${aiReusedCount}, fallback ${aiFallbackCount}`);
  }
  if (!options.dryRun && aiAttempted > 0 && aiFallbackCount / aiAttempted > 0.2) {
    await prisma.systemEvent.create({
      data: {
        level: "warn",
        category: "predictions.ai-copy",
        message: `AI prediction copy fallback rate ${aiFallbackCount}/${aiAttempted}`,
        source: "scripts/generate-prediction-snapshots"
      }
    }).catch(() => {});
  }
```

- [ ] **Step 6: Verify**

Run: `node --check scripts/generate-prediction-snapshots.js` → без ошибок
Run: `npm run test` → все зелёные
Run: `npm run typecheck` → без ошибок

- [ ] **Step 7: Commit**

```bash
git add scripts/generate-prediction-snapshots.js
git commit -m "feat: AI prediction copy with hash gate in snapshot generator"
```

### Task 7: Прогон и верификация

- [ ] **Step 1: Локальный dry-run** — `node scripts/generate-prediction-snapshots.js --dry-run --limit 2`
  (локальный .env содержит DeepSeek-ключ). Ожидается: два боя с блоками текстов, без записи.
- [ ] **Step 2: Показать тексты пользователю** — глазная проверка качества до включения (гейт из спеки).
- [ ] **Step 3: Push** → GitHub Actions деплой применит миграцию и код на сервере.
- [ ] **Step 4: Прогон на сервере** — `sudo -u fightbase node scripts/generate-prediction-snapshots.js`,
  в выводе `AI copy: generated N, reused 0, fallback M`; проверить M/N.
- [ ] **Step 5: Повторный прогон** — ожидается `generated 0, reused N` (хэш-гейт работает).
- [ ] **Step 6: Проверить страницу** — curl главного боя: текст не шаблонный, имена в именительном.
- [ ] **Step 7: Smoke** — `npm run test:smoke` локально зелёный.
