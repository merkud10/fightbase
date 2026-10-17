#!/usr/bin/env node
// Русское имя и биография для бойцов ближайших турниров, у которых их нет.
// ESPN-синки (sync-roster-upcoming, фото из Sherdog) дают рекорд, рост и фото, но
// nameRu и bio не трогают, а ufc.ru с прода отвечает 403. Новичок, заявленный за
// неделю до турнира, оставался с английским именем в заголовке ровно тогда, когда
// его ищут («франсиско прадо боец»: CTR 7% в Google, конкурентов в выдаче нет).
//
//   node scripts/localize-upcoming-fighters.js                    # сухой прогон
//   node scripts/localize-upcoming-fighters.js --apply            # запись
//   node scripts/localize-upcoming-fighters.js --days-forward 30 --fighter-slug javad-mahjoub
//   node scripts/localize-upcoming-fighters.js --fighter-slug petr-yan --force-bio --apply  # переписать био одному
//   node scripts/localize-upcoming-fighters.js --all-templates --apply  # все шаблонные био в базе, не только к турнирам
//   node scripts/localize-upcoming-fighters.js --slugs-file top.txt --apply   # переписать био по списку (по показам в GSC)
//   node scripts/localize-upcoming-fighters.js --all-empty --apply      # все пустые имена и био
//   node scripts/localize-upcoming-fighters.js --all-weak --apply       # все слабые био (isWeakBio)
//   --name-suggestions out.jsonl — если модель пишет имя иначе, чем на сайте, имя не
//   меняем, а пишем предложение в файл на утверждение. --stop-after-failures N (5).
//
// Порядок для имени: ручной словарь → ИИ (если прошло проверку) → транслитерация.
// Биография: ИИ → шаблон buildGenericBio. Заполненные поля не перезаписываем,
// кроме шаблонной биографии (isTemplateBio): её меняем на текст модели.
// Ежедневный крон: cron-tasks.sh localize-upcoming.
//
// Модель — та же, что у прогнозов: gpt-6.1-sol через мост Codex с веб-поиском
// (FIGHTER_AI_MODEL переопределяет). Поиск нужен, чтобы взять написание имени из
// русскоязычных СМИ, а не транскрибировать «Suyoung You» буква в букву.

const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");

const { buildGenericBio, getManualRussianName, parseArgs, transliterateName } = require("./fighter-import-utils");
const { cleanAiBio, isAcceptableRussianBio, isAcceptableRussianName, isTemplateBio, isWeakBio } = require("./fighter-ru-profile");

const prisma = new PrismaClient();

function readEnv(name, fallback = "") {
  if (process.env[name]) return process.env[name];
  try {
    const contents = fs.readFileSync(path.join(process.cwd(), ".env"), "utf8");
    const line = contents.split(/\r?\n/).find((item) => item.startsWith(`${name}=`));
    const value = line ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") : "";
    return value || fallback;
  } catch {
    return fallback;
  }
}

function parseModelJson(content) {
  const text = String(content || "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  try {
    return JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text);
  } catch {
    return null;
  }
}

function isPlaceholder(slug) {
  return String(slug || "")
    .split("-")
    .some((part) => part === "tba" || part === "tbd");
}

function buildPrompt(fighter) {
  return [
    "Нужен русскоязычный профиль бойца UFC для карточки на сайте.",
    "Верни строгий JSON с ключами nameRu и bioRu, без пояснений.",
    "nameRu: имя и фамилия по-русски. Найди, как бойца пишут русскоязычные спортивные СМИ (sports.ru, championat.com, ufc.ru, matchtv.ru); если там его нет, дай практическую транскрипцию по правилам языка происхождения имени (корейские и китайские имена — в принятом по-русски порядке). Без прозвища и лишних слов. Если на сайте уже есть написание и оно верное — повтори его; если СМИ пишут иначе — дай их вариант.",
    "bioRu: 2-4 предложения естественным русским языком: откуда боец, весовая категория, рекорд и главное, чем он известен — титулы и громкие победы и до UFC, и в самом UFC (для бывших и действующих чемпионов UFC это обязательно). Если в данных есть ближайший бой — с кем и когда выходит; если нет, о будущих боях не пиши. Только проверенные факты из данных ниже и из поиска; если факта нет, не пиши его. Без латиницы, кроме названий промоушенов (UFC, LFA и т.п.), без ставок и коэффициентов, без ссылок и упоминаний источников. Имя в тексте пиши так же, как в nameRu. Не используй слово «бойчиха» (пиши «спортсменка» или «боец») и пустые фразы вроде «сохраняет заметную позицию в дивизионе» или «не участвует в активных соревнованиях»; если боец завершил карьеру, так и напиши.",
    "",
    `Name: ${fighter.name}`,
    fighter.nameRu ? `Russian name currently on the site: ${fighter.nameRu}` : "",
    `Nickname: ${fighter.nickname || ""}`,
    `Country: ${fighter.country || ""}`,
    `Weight class: ${fighter.weightClass || ""}`,
    `Record: ${fighter.record || ""}`,
    `Team: ${fighter.team || ""}`,
    `Next fight: ${fighter.nextFight || "none scheduled"}`
  ].join("\n");
}

async function localizeWithBridge(fighter) {
  const baseUrl = readEnv("CODEX_BRIDGE_URL").trim();
  const token = readEnv("CODEX_BRIDGE_TOKEN").trim();
  if (!baseUrl || !token) throw new Error("CODEX_BRIDGE_URL/CODEX_BRIDGE_TOKEN are not configured");

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(450_000),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      model: readEnv("FIGHTER_AI_MODEL", "gpt-6.1-sol").trim(),
      temperature: 0.2,
      web_search: true,
      messages: [
        {
          role: "system",
          content: "Ты редактор русскоязычного UFC-медиа. Пишешь точно, без выдуманных фактов. Отвечаешь только JSON."
        },
        { role: "user", content: buildPrompt(fighter) }
      ]
    })
  });
  if (!response.ok) throw new Error(`bridge HTTP ${response.status}`);
  const parsed = parseModelJson((await response.json())?.choices?.[0]?.message?.content);
  return {
    nameRu: String(parsed?.nameRu || "").replace(/\s+/g, " ").trim(),
    bioRu: cleanAiBio(parsed?.bioRu)
  };
}

// Заменяет вариант имени из ответа модели на имя, которое остаётся на сайте:
// полностью и по фамилии, чтобы текст не расходился с заголовком карточки.
function alignBioName(bio, fromName, toName) {
  if (!fromName || !toName || fromName === toName) return bio;
  let text = bio.split(fromName).join(toName);
  const fromSurname = fromName.split(/\s+/).pop();
  const toSurname = toName.split(/\s+/).pop();
  if (fromSurname && toSurname && fromSurname !== toSurname && fromSurname.length >= 3) {
    text = text.split(fromSurname).join(toSurname);
  }
  return text;
}

async function selectFighters(args) {
  const forceBio = Boolean(args["force-bio"] && args["fighter-slug"]) || Boolean(args["slugs-file"]);
  const fighters = new Map();
  const add = (fighter, nextFight = "") => {
    if (!fighter || isPlaceholder(fighter.slug) || fighters.has(fighter.id)) return;
    fighters.set(fighter.id, { ...fighter, nextFight });
  };

  const daysForward = Number.parseInt(args["days-forward"] || "21", 10);
  const until = new Date(Date.now() + daysForward * 86_400_000);
  const fights = await prisma.fight.findMany({
    where: { event: { status: "upcoming", date: { lte: until } } },
    select: { fighterA: true, fighterB: true, event: { select: { name: true, date: true } } }
  });
  const upcoming = new Map();
  for (const fight of fights) {
    for (const [fighter, opponent] of [
      [fight.fighterA, fight.fighterB],
      [fight.fighterB, fight.fighterA]
    ]) {
      if (fighter) {
        const date = fight.event.date.toISOString().slice(0, 10);
        upcoming.set(fighter.id, `${fight.event.name}, ${date}, vs ${opponent?.name || "TBA"}`);
      }
    }
  }

  const needsWork = (fighter) =>
    forceBio || !fighter.nameRu || !String(fighter.bio || "").trim() || isTemplateBio(fighter.bio);

  if (args["slugs-file"]) {
    const slugs = fs.readFileSync(args["slugs-file"], "utf8").split(/\s+/).filter(Boolean);
    const rows = await prisma.fighter.findMany({ where: { slug: { in: slugs } } });
    const bySlug = new Map(rows.map((row) => [row.slug, row]));
    for (const slug of slugs) {
      const fighter = bySlug.get(slug);
      if (fighter) add(fighter, upcoming.get(fighter.id) || "");
    }
  } else if (args["all-empty"] || args["all-weak"] || args["all-templates"]) {
    const rows = await prisma.fighter.findMany({ where: { promotion: { slug: "ufc" } }, orderBy: { slug: "asc" } });
    for (const fighter of rows) {
      const bio = String(fighter.bio || "").trim();
      const empty = !fighter.nameRu || !bio;
      const pick =
        (args["all-empty"] && empty) ||
        (args["all-templates"] && isTemplateBio(bio)) ||
        (args["all-weak"] && !empty && isWeakBio(bio));
      if (pick) add(fighter, upcoming.get(fighter.id) || "");
    }
  } else {
    const rows = await prisma.fighter.findMany({ where: { id: { in: [...upcoming.keys()] } } });
    for (const fighter of rows) {
      if (args["fighter-slug"] && fighter.slug !== args["fighter-slug"]) continue;
      if (needsWork(fighter)) add(fighter, upcoming.get(fighter.id));
    }
    if (args["fighter-slug"] && fighters.size === 0) {
      const one = await prisma.fighter.findUnique({ where: { slug: args["fighter-slug"] } });
      if (one && needsWork(one)) add(one, upcoming.get(one.id) || "");
    }
  }

  const replaceBio = (fighter) =>
    forceBio || Boolean(args["all-weak"]) || !String(fighter.bio || "").trim() || isTemplateBio(fighter.bio);
  return { fighters: [...fighters.values()], replaceBio };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apply = Boolean(args.apply);
  const stopAfter = Number.parseInt(args["stop-after-failures"] || "5", 10);
  const suggestionsFile = typeof args["name-suggestions"] === "string" ? args["name-suggestions"] : null;
  const { fighters, replaceBio } = await selectFighters(args);
  console.log(`selected ${fighters.length} fighters`);

  const results = [];
  let failuresInRow = 0;
  for (const fighter of fighters) {
    let ai = null;
    try {
      ai = await localizeWithBridge(fighter);
      failuresInRow = 0;
    } catch (error) {
      failuresInRow += 1;
      console.error(`[ai failed] ${fighter.slug}: ${error.message || error}`);
      if (failuresInRow >= stopAfter) {
        console.error(`stopping after ${failuresInRow} failures in a row`);
        break;
      }
    }

    const manualName = getManualRussianName(fighter.name);
    const aiName = ai && isAcceptableRussianName(ai.nameRu, fighter.name) ? ai.nameRu : null;
    const nameRu = fighter.nameRu || manualName || aiName || transliterateName(fighter.name);
    const nameSource = fighter.nameRu ? "kept" : manualName ? "manual" : aiName ? "ai" : "translit";
    if (fighter.nameRu && aiName && aiName !== fighter.nameRu && !manualName && suggestionsFile) {
      const suggestion = { slug: fighter.slug, name: fighter.name, current: fighter.nameRu, suggested: aiName };
      fs.appendFileSync(suggestionsFile, `${JSON.stringify(suggestion)}\n`);
    }

    let bio = String(fighter.bio || "").trim();
    let bioSource = "kept";
    if (replaceBio(fighter)) {
      const aiBio = ai ? alignBioName(ai.bioRu, ai.nameRu, nameRu) : "";
      if (ai && isAcceptableRussianBio(aiBio)) {
        bio = aiBio;
        bioSource = "ai";
      } else if (bio) {
        // Модель не дала годного текста — оставляем то, что есть.
        bioSource = "kept-old";
      } else {
        bio = buildGenericBio({
          nameRu,
          promotionSlug: "ufc",
          country: fighter.country,
          weightClass: fighter.weightClass,
          status: fighter.status,
          nickname: fighter.nickname,
          record: fighter.record,
          team: fighter.team,
          highlights: "",
          style: fighter.style,
          winsByKnockout: fighter.winsByKnockout,
          winsBySubmission: fighter.winsBySubmission
        });
        bioSource = "template";
      }
    }

    const changed = nameSource !== "kept" || bioSource === "ai" || bioSource === "template";
    results.push({ slug: fighter.slug, nameSource, bioSource, changed });
    console.log(`[${apply ? "update" : "would update"}] ${fighter.slug}: ${fighter.name} → ${nameRu} (${nameSource}), bio ${bioSource}`);
    if (!apply) {
      console.log(`    ${bio}`);
      if (ai && bioSource !== "ai") console.log(`    [rejected ai bio] ${ai.bioRu || "<empty>"}`);
      if (ai && nameSource === "translit") console.log(`    [rejected ai name] ${ai.nameRu || "<empty>"}`);
    }

    if (apply && changed) {
      await prisma.fighter.update({ where: { id: fighter.id }, data: { nameRu, bio } });
    }
  }

  const count = (key, value) => results.filter((item) => item[key] === value).length;
  console.log(
    JSON.stringify({
      selected: fighters.length,
      processed: results.length,
      updated: apply ? results.filter((item) => item.changed).length : 0,
      ai: count("nameSource", "ai"),
      translit: count("nameSource", "translit"),
      aiBio: count("bioSource", "ai"),
      keptOld: count("bioSource", "kept-old"),
      templateBio: count("bioSource", "template")
    })
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
