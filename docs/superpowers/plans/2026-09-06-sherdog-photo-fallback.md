# Добор фото бойцов из Sherdog — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Бойцы ближайших турниров без портрета в ESPN получают фото из Sherdog автоматически, раз в сутки, без риска подставить чужое лицо.

**Architecture:** Чистые парсеры HTML Sherdog и правила выбора кандидата живут в `scripts/sherdog-utils.js` и покрыты юнит-тестами. CLI `scripts/fill-fighter-photos-from-sherdog.js` выбирает бойцов из Prisma, ходит в Sherdog через `fetchText`, сохраняет фото через `persistImageLocally` и обновляет `photoUrl`. Cron-задача `sync-photos-upcoming` в `scripts/cron-tasks.sh` запускает CLI после ESPN-синка.

**Tech Stack:** Node.js (CommonJS-скрипты, как остальные в `scripts/`), Prisma, `node --test` + tsx для тестов.

Спека: `docs/superpowers/specs/2026-09-06-sherdog-photo-fallback-design.md`.

---

## Файлы

- Create: `scripts/sherdog-utils.js` — парсеры и правила выбора, без сети и БД.
- Create: `tests/sherdog-utils.test.ts` — тесты парсеров на встроенных HTML-фрагментах.
- Create: `scripts/fill-fighter-photos-from-sherdog.js` — CLI.
- Modify: `scripts/cron-tasks.sh` — задача `sync-photos-upcoming`, usage, шапка.
- Modify: `scripts/README.md:13-14` — список cron-задач.

---

### Task 1: Парсеры Sherdog

**Files:**
- Create: `scripts/sherdog-utils.js`
- Test: `tests/sherdog-utils.test.ts`

- [ ] **Step 1: Написать падающие тесты**

```ts
import assert from "node:assert/strict";
import test from "node:test";

const {
  buildPhotoSourceUrls,
  buildSearchUrl,
  parseFighterPage,
  parseSearchResults,
  pickSearchCandidate,
  verifyFighterPage
} = require("../scripts/sherdog-utils.js");

// Фрагменты реальной разметки Sherdog (fightfinder и страница бойца), 06.09.2026.
const SEARCH_HTML = `
<table>
<tr><td class="col_five">Association</td></tr>
<tr onclick="document.location='/fighter/Arlind-Berisha-348399';">
  <td width="60"><img class="lazy" src="/image_crop/100/100/_images/fighter_small_default.jpg" data-original="/image_crop/100/100/_images/fighter/1746294719300_1746294710arlindberisha.jpg" width='44'/></td>
  <td><a href="/fighter/Arlind-Berisha-348399">Arlind Berisha</a></td>
  <td></td>
  <td><strong>6'6"</strong><br />(1.98 m)</td>
  <td><strong>205 lbs</strong><br />(92.99 kg)</td>
  <td>Sarpsborg Chi MMA &amp; Kickboxing</td>
</tr>
<tr onclick="document.location='/fighter/Arlind-Berisha-999999';">
  <td width="60"><img class="lazy" src="/image_crop/100/100/_images/fighter_small_default.jpg" width='44'/></td>
  <td><a href="/fighter/Arlind-Berisha-999999">Arlind Berisha</a></td>
  <td></td>
  <td><strong>5'8"</strong><br />(1.73 m)</td>
  <td><strong>155 lbs</strong><br />(70.31 kg)</td>
  <td></td>
</tr>
</table>`;

const PAGE_HTML = `
<h1 itemprop="name"><span class="fn">Colton Loud</span></h1>
<img itemprop="image" src="/image_crop/200/300/_images/fighter/20260315110638_Colton_Loud.JPG" class="profile-image photo" alt="Colton Loud" />
<tr><td>HEIGHT</td><td><b itemprop="height">5'10"</b> <em>/</em> 177.8 cm</td></tr>
<div class="winloses win">
    <span>Wins</span>
    <span>7</span>
</div>
<div class="winloses lose">
    <span>Losses</span>
    <span>1</span>
</div>`;

test("parseSearchResults reads name, path and height of every result row", () => {
  assert.deepEqual(parseSearchResults(SEARCH_HTML), [
    { name: "Arlind Berisha", path: "/fighter/Arlind-Berisha-348399", heightCm: 198 },
    { name: "Arlind Berisha", path: "/fighter/Arlind-Berisha-999999", heightCm: 173 }
  ]);
});

test("parseFighterPage reads name, photo, record and height", () => {
  assert.deepEqual(parseFighterPage(PAGE_HTML), {
    name: "Colton Loud",
    photoPath: "/image_crop/200/300/_images/fighter/20260315110638_Colton_Loud.JPG",
    wins: 7,
    losses: 1,
    heightCm: 178
  });
});

test("parseFighterPage tolerates a page without record or photo", () => {
  assert.deepEqual(parseFighterPage('<span class="fn">Nobody Here</span>'), {
    name: "Nobody Here",
    photoPath: null,
    wins: null,
    losses: null,
    heightCm: null
  });
});

test("pickSearchCandidate takes the only exact name match", () => {
  const rows = parseSearchResults(SEARCH_HTML).slice(0, 1);
  assert.deepEqual(pickSearchCandidate({ name: "Arlind Berisha", heightCm: null }, rows), { row: rows[0] });
});

test("pickSearchCandidate matches names ignoring diacritics and case", () => {
  const rows = [{ name: "José Aldo", path: "/fighter/Jose-Aldo-11506", heightCm: 170 }];
  assert.deepEqual(pickSearchCandidate({ name: "jose aldo" }, rows), { row: rows[0] });
});

test("pickSearchCandidate reports unmatched when no row has the same name", () => {
  const rows = parseSearchResults(SEARCH_HTML);
  assert.deepEqual(pickSearchCandidate({ name: "Reginaldo Junior" }, rows), { reason: "unmatched" });
});

test("pickSearchCandidate disambiguates namesakes by height within 3 cm", () => {
  const rows = parseSearchResults(SEARCH_HTML);
  assert.deepEqual(pickSearchCandidate({ name: "Arlind Berisha", heightCm: 196 }, rows), { row: rows[0] });
  assert.deepEqual(pickSearchCandidate({ name: "Arlind Berisha", heightCm: 185 }, rows), {
    reason: "ambiguous",
    candidates: 2
  });
  assert.deepEqual(pickSearchCandidate({ name: "Arlind Berisha", heightCm: null }, rows), {
    reason: "ambiguous",
    candidates: 2
  });
});

test("verifyFighterPage accepts a matching page", () => {
  const page = parseFighterPage(PAGE_HTML);
  assert.equal(verifyFighterPage({ name: "Colton Loud", record: "7-1-0" }, page), null);
  // ESPN и Sherdog расходятся на один бой — это нормально.
  assert.equal(verifyFighterPage({ name: "Colton Loud", record: "8-1-0" }, page), null);
  assert.equal(verifyFighterPage({ name: "Colton Loud", record: null }, page), null);
});

test("verifyFighterPage rejects another person, a placeholder photo and a different record", () => {
  const page = parseFighterPage(PAGE_HTML);
  assert.equal(verifyFighterPage({ name: "Colton Proud", record: "7-1-0" }, page), "name mismatch");
  assert.equal(
    verifyFighterPage({ name: "Colton Loud", record: "12-2-0" }, page),
    "record mismatch (ours 12-2-0, sherdog 7-1)"
  );
  assert.equal(
    verifyFighterPage({ name: "Colton Loud", record: "7-1-0" }, { ...page, photoPath: "/image_crop/200/300/_images/fighter_default.jpg" }),
    "no photo"
  );
  assert.equal(verifyFighterPage({ name: "Colton Loud", record: "7-1-0" }, { ...page, photoPath: null }), "no photo");
});

test("buildPhotoSourceUrls prefers the CDN original and falls back to the crop", () => {
  assert.deepEqual(buildPhotoSourceUrls("/image_crop/200/300/_images/fighter/20260315110638_Colton_Loud.JPG"), [
    "https://www1-cdn.sherdog.com/_images/fighter/20260315110638_Colton_Loud.JPG",
    "https://www.sherdog.com/image_crop/200/300/_images/fighter/20260315110638_Colton_Loud.JPG"
  ]);
  assert.deepEqual(buildPhotoSourceUrls(null), []);
});

test("buildSearchUrl encodes the fighter name", () => {
  assert.equal(
    buildSearchUrl("José Aldo"),
    "https://www.sherdog.com/stats/fightfinder?SearchTxt=Jos%C3%A9%20Aldo"
  );
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `node --import tsx --test tests/sherdog-utils.test.ts`
Expected: FAIL, `Cannot find module '../scripts/sherdog-utils.js'`.

- [ ] **Step 3: Реализовать `scripts/sherdog-utils.js`**

```js
// Парсеры Sherdog и правила выбора кандидата для добора фото бойцов.
// Спека: docs/superpowers/specs/2026-09-06-sherdog-photo-fallback-design.md
// Без сети и БД, чтобы разметку и правила можно было проверять тестами.

const { normalizeFighterName } = require("./fighter-name-matching");

const SHERDOG_ORIGIN = "https://www.sherdog.com";
const SHERDOG_CDN_ORIGIN = "https://www1-cdn.sherdog.com";
// Рост у ESPN и Sherdog округляют по-разному (дюймы ↔ см).
const HEIGHT_TOLERANCE_CM = 3;
// Один бой разницы — разный учёт выставочных/отменённых боёв, больше — другой человек.
const WINS_TOLERANCE = 1;

function decodeEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .trim();
}

function parseSearchResults(html) {
  const rows = [];
  const rowPattern = /<tr onclick="document\.location='(\/fighter\/[^']+)';">([\s\S]*?)<\/tr>/g;
  let match;

  while ((match = rowPattern.exec(String(html || "")))) {
    const nameMatch = match[2].match(/<a href="\/fighter\/[^"]+">([^<]+)<\/a>/);
    if (!nameMatch) {
      continue;
    }
    const heightMatch = match[2].match(/\(([\d.]+)\s*m\)/);
    rows.push({
      name: decodeEntities(nameMatch[1]),
      path: match[1],
      heightCm: heightMatch ? Math.round(Number(heightMatch[1]) * 100) : null
    });
  }

  return rows;
}

function parseCounter(source, kind) {
  const match = source.match(new RegExp(`<div class="winloses ${kind}">\\s*<span>[^<]*</span>\\s*<span>(\\d+)</span>`));
  return match ? Number(match[1]) : null;
}

function parseFighterPage(html) {
  const source = String(html || "");
  const heightMatch = source.match(/itemprop="height">[^<]*<\/b>\s*<em>\/<\/em>\s*([\d.]+)\s*cm/);

  return {
    name: decodeEntities((source.match(/<span class="fn">([^<]+)<\/span>/) || [])[1] || ""),
    photoPath: (source.match(/<img[^>]+itemprop="image"[^>]+src="([^"]+)"/) || [])[1] || null,
    wins: parseCounter(source, "win"),
    losses: parseCounter(source, "lose"),
    heightCm: heightMatch ? Math.round(Number(heightMatch[1])) : null
  };
}

function pickSearchCandidate(fighter, rows) {
  const target = normalizeFighterName(fighter?.name);
  const byName = (rows || []).filter((row) => normalizeFighterName(row.name) === target);

  if (byName.length === 1) {
    return { row: byName[0] };
  }
  if (byName.length === 0) {
    return { reason: "unmatched" };
  }

  const ownHeight = Number(fighter?.heightCm) || 0;
  if (ownHeight > 0) {
    const byHeight = byName.filter(
      (row) => row.heightCm && Math.abs(row.heightCm - ownHeight) <= HEIGHT_TOLERANCE_CM
    );
    if (byHeight.length === 1) {
      return { row: byHeight[0] };
    }
  }

  return { reason: "ambiguous", candidates: byName.length };
}

function parseRecordWins(record) {
  const match = String(record || "").match(/^(\d+)-(\d+)/);
  return match ? Number(match[1]) : null;
}

function verifyFighterPage(fighter, page) {
  if (normalizeFighterName(page?.name) !== normalizeFighterName(fighter?.name)) {
    return "name mismatch";
  }
  if (!page?.photoPath || /default/i.test(page.photoPath)) {
    return "no photo";
  }

  const ownWins = parseRecordWins(fighter?.record);
  if (ownWins !== null && page.wins !== null && Math.abs(ownWins - page.wins) > WINS_TOLERANCE) {
    return `record mismatch (ours ${fighter.record}, sherdog ${page.wins}-${page.losses ?? "?"})`;
  }

  return null;
}

function buildPhotoSourceUrls(photoPath) {
  const path = String(photoPath || "");
  const file = (path.match(/\/_images\/fighter\/([^/?#]+)$/) || [])[1];
  const urls = [];

  if (file) {
    urls.push(`${SHERDOG_CDN_ORIGIN}/_images/fighter/${file}`);
  }
  if (path.startsWith("/")) {
    urls.push(`${SHERDOG_ORIGIN}${path}`);
  }

  return urls;
}

function buildSearchUrl(name) {
  return `${SHERDOG_ORIGIN}/stats/fightfinder?SearchTxt=${encodeURIComponent(String(name || "").trim())}`;
}

module.exports = {
  SHERDOG_ORIGIN,
  buildPhotoSourceUrls,
  buildSearchUrl,
  parseFighterPage,
  parseSearchResults,
  pickSearchCandidate,
  verifyFighterPage
};
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `node --import tsx --test tests/sherdog-utils.test.ts`
Expected: все тесты `✔`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add scripts/sherdog-utils.js tests/sherdog-utils.test.ts
git commit -m "feat(photos): парсеры Sherdog и правила выбора бойца"
```

---

### Task 2: CLI добора фото

**Files:**
- Create: `scripts/fill-fighter-photos-from-sherdog.js`

Сетевой и БД-код без юнит-тестов: проверяется сухим прогоном на проде (Task 4).

- [ ] **Step 1: Написать скрипт**

```js
#!/usr/bin/env node

// Добор фото из Sherdog для бойцов ближайших турниров, у которых после ESPN
// нет пригодного портрета: новички Dana White's Contender Series и замены на
// коротком уведомлении. ESPN остаётся основным источником, Sherdog — запасной.
// Спека: docs/superpowers/specs/2026-09-06-sherdog-photo-fallback-design.md
//
// Запуск: node scripts/fill-fighter-photos-from-sherdog.js [--days-back 1]
//   [--days-forward 10] [--event <slug>] [--fighter-slug <slug>] [--limit N] [--apply]
// Без --apply — сухой прогон: печатает, что нашёл бы, БД и диск не трогает.
// Ежедневный крон: cron-tasks.sh sync-photos-upcoming.

const { PrismaClient } = require("@prisma/client");

const { hasUsablePhoto } = require("./espn-enrich");
const { fetchText, parseArgs } = require("./fighter-import-utils");
const { persistImageLocally } = require("./local-image-store");
const {
  SHERDOG_ORIGIN,
  buildPhotoSourceUrls,
  buildSearchUrl,
  parseFighterPage,
  parseSearchResults,
  pickSearchCandidate,
  verifyFighterPage
} = require("./sherdog-utils");

const prisma = new PrismaClient();

const DAYS_BACK = 1;
const DAYS_FORWARD = 10;
const REQUEST_DELAY_MS = 1500;
const DAY_MS = 24 * 60 * 60 * 1000;

const FIGHTER_SELECT = { id: true, slug: true, name: true, record: true, heightCm: true, photoUrl: true };

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function selectFighters({ daysBack, daysForward, eventSlug, fighterSlug, limit }) {
  if (fighterSlug) {
    const fighter = await prisma.fighter.findUnique({ where: { slug: fighterSlug }, select: FIGHTER_SELECT });
    return fighter ? [fighter] : [];
  }

  const where = eventSlug
    ? { slug: eventSlug }
    : { date: { gte: new Date(Date.now() - daysBack * DAY_MS), lte: new Date(Date.now() + daysForward * DAY_MS) } };

  const events = await prisma.event.findMany({
    where,
    orderBy: { date: "asc" },
    select: {
      fights: {
        select: { fighterA: { select: FIGHTER_SELECT }, fighterB: { select: FIGHTER_SELECT } }
      }
    }
  });

  const seen = new Set();
  const fighters = [];
  for (const event of events) {
    for (const fight of event.fights) {
      for (const fighter of [fight.fighterA, fight.fighterB]) {
        if (!fighter || seen.has(fighter.id)) {
          continue;
        }
        seen.add(fighter.id);
        if (!hasUsablePhoto(fighter.photoUrl)) {
          fighters.push(fighter);
        }
      }
    }
  }

  return limit ? fighters.slice(0, limit) : fighters;
}

async function resolvePhoto(fighter) {
  const searchHtml = await fetchText(buildSearchUrl(fighter.name));
  const picked = pickSearchCandidate(fighter, parseSearchResults(searchHtml));
  if (!picked.row) {
    return { status: picked.reason, detail: picked.candidates ? `${picked.candidates} кандидатов` : "" };
  }

  await sleep(REQUEST_DELAY_MS);
  const page = parseFighterPage(await fetchText(`${SHERDOG_ORIGIN}${picked.row.path}`));
  const rejection = verifyFighterPage(fighter, page);
  if (rejection) {
    return { status: "skipped", detail: `${rejection} (${picked.row.path})` };
  }

  return { status: "found", path: picked.row.path, sourceUrls: buildPhotoSourceUrls(page.photoPath) };
}

async function persistPhoto(fighter, sourceUrls) {
  let lastError = null;
  for (const sourceUrl of sourceUrls) {
    try {
      const localUrl = await persistImageLocally({ bucket: "fighters", key: fighter.slug, sourceUrl });
      if (localUrl) {
        return localUrl;
      }
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("no photo source urls");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apply = Boolean(args.apply);
  const limit = Number(args.limit || 0) || null;
  const daysBack = args["days-back"] === undefined ? DAYS_BACK : Math.max(0, Number(args["days-back"]) || 0);
  const daysForward = args["days-forward"] === undefined ? DAYS_FORWARD : Math.max(1, Number(args["days-forward"]) || DAYS_FORWARD);
  const eventSlug = String(args.event || "").trim();
  const fighterSlug = String(args["fighter-slug"] || "").trim();

  const fighters = await selectFighters({ daysBack, daysForward, eventSlug, fighterSlug, limit });
  const scope = fighterSlug ? fighterSlug : eventSlug ? eventSlug : `−${daysBack}/+${daysForward} days`;
  console.log(`Fighters without usable photo (${scope}): ${fighters.length}${apply ? "" : " (dry run)"}`);

  const counters = { updated: 0, unmatched: 0, ambiguous: 0, skipped: 0, failed: 0 };

  for (const fighter of fighters) {
    try {
      const result = await resolvePhoto(fighter);
      if (result.status !== "found") {
        counters[result.status] += 1;
        console.log(`[${result.status}] ${fighter.slug}${result.detail ? `: ${result.detail}` : ""}`);
      } else if (!apply) {
        counters.updated += 1;
        console.log(`[would update] ${fighter.slug} ← ${result.path}`);
      } else {
        const photoUrl = await persistPhoto(fighter, result.sourceUrls);
        await prisma.fighter.update({ where: { id: fighter.id }, data: { photoUrl } });
        counters.updated += 1;
        console.log(`[updated] ${fighter.slug} ← ${result.path} → ${photoUrl}`);
      }
    } catch (error) {
      counters.failed += 1;
      console.warn(`[failed] ${fighter.slug}: ${error.message}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  console.log("");
  console.log(
    `Summary: updated=${counters.updated} unmatched=${counters.unmatched} ambiguous=${counters.ambiguous} skipped=${counters.skipped} failed=${counters.failed}${apply ? "" : " (dry run: planned results)"}`
  );

  // Только полный провал (Sherdog недоступен) должен ронять cron-задачу.
  if (fighters.length > 0 && counters.failed === fighters.length) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 2: Проверить синтаксис**

Run: `node --check scripts/fill-fighter-photos-from-sherdog.js`
Expected: без вывода, код выхода 0.

- [ ] **Step 3: Commit**

```bash
git add scripts/fill-fighter-photos-from-sherdog.js
git commit -m "feat(photos): CLI добора фото бойцов из Sherdog"
```

---

### Task 3: Cron-задача и документация

**Files:**
- Modify: `scripts/cron-tasks.sh` (шапка строки 6-12, ветка после `sync-roster-upcoming` строка 286, usage строка 358)
- Modify: `scripts/README.md:13-14`

- [ ] **Step 1: Добавить ветку в `cron-tasks.sh`** после `;;` ветки `sync-roster-upcoming`

```bash
  sync-photos-upcoming)
    log "Starting sync-photos-upcoming"
    # Запасной источник фото: у новичков DWCS и замен портрета в ESPN нет, а
    # Sherdog отвечает с прода. Идёт после sync-roster-upcoming, чтобы ESPN
    # успел заполнить всё, что может.
    output=$(cd /opt/fightbase && node scripts/fill-fighter-photos-from-sherdog.js --days-back 1 --days-forward 10 --apply 2>&1) || {
      log "sync-photos-upcoming FAILED: ${output}"
      send_tg_alert "❌ Фото к ближайшим турнирам: сбой добора из Sherdog"
      exit 1
    }
    log "sync-photos-upcoming: ${output}"
    updated="$(echo "${output}" | sed -n 's/.*updated=\([0-9]*\).*/\1/p' | tail -n 1)"
    if [ "${updated:-0}" != "0" ]; then
      send_tg_alert "✅ Фото к ближайшим турнирам: добавлено ${updated} из Sherdog"
    fi
    ;;
```

Шапка: добавить строку `#   sync-photos-upcoming — фото из Sherdog бойцам ближайших турниров без портрета`. Usage: добавить `sync-photos-upcoming` после `sync-roster-upcoming`.

- [ ] **Step 2: README** — в перечень задач после `sync-roster-upcoming (...)` добавить `sync-photos-upcoming` (daily, Sherdog photos for fighters on cards within 10 days who have none after ESPN).

- [ ] **Step 3: Прогнать тесты cron-tasks и весь набор**

Run: `npm test`
Expected: `# fail 0`.

- [ ] **Step 4: Commit**

```bash
git add scripts/cron-tasks.sh scripts/README.md
git commit -m "ops(cron): ежедневный добор фото из Sherdog"
```

---

### Task 4: Прогон на проде и crontab

- [ ] **Step 1:** `git push origin master`, дождаться деплоя (`git rev-parse --short HEAD` в `/opt/fightbase` совпадает с локальным, сервисы `active`).
- [ ] **Step 2:** Сухой прогон: `cd /opt/fightbase && node scripts/fill-fighter-photos-from-sherdog.js --event dana-whites-contender-series-season-10-week-5`. Сверить найденные пути Sherdog с бойцами.
- [ ] **Step 3:** Боевой прогон: тот же с `--apply`. Проверить `photoUrl` в БД и карточку бойца на сайте; если `/_next/image` отдаёт 400 на новый файл — `systemctl restart fightbase`.
- [ ] **Step 4:** Crontab пользователя fightbase: `40 5 * * * bash /opt/fightbase/scripts/cron-tasks.sh sync-photos-upcoming >> /var/log/fightbase/cron.log 2>&1`.
- [ ] **Step 5:** Прогон на всём окне: `node scripts/fill-fighter-photos-from-sherdog.js --days-forward 40 --apply` для остальных ближайших кардов.
