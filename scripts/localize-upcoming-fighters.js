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
//
// Порядок для имени: ручной словарь → ИИ (если прошло проверку) → транслитерация.
// Биография: ИИ → шаблон buildGenericBio. Заполненные поля не перезаписываем.
// Ежедневный крон: cron-tasks.sh localize-upcoming.
//
// Модель — та же, что у прогнозов: gpt-6.1-sol через мост Codex с веб-поиском
// (FIGHTER_AI_MODEL переопределяет). Поиск нужен, чтобы взять написание имени из
// русскоязычных СМИ, а не транскрибировать «Suyoung You» буква в букву.

const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");

const { buildGenericBio, getManualRussianName, parseArgs, transliterateName } = require("./fighter-import-utils");
const { isAcceptableRussianBio, isAcceptableRussianName } = require("./fighter-ru-profile");

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
    "nameRu: имя и фамилия по-русски. Найди, как бойца пишут русскоязычные спортивные СМИ (sports.ru, championat.com, ufc.ru, matchtv.ru); если там его нет, дай практическую транскрипцию по правилам языка происхождения имени (корейские и китайские имена — в принятом по-русски порядке). Без прозвища и лишних слов.",
    "bioRu: 2-4 предложения естественным русским языком: откуда боец, весовая категория, рекорд, чем известен до UFC и с кем выходит на ближайший турнир. Только проверенные факты из данных ниже и из поиска; если факта нет, не пиши его. Без латиницы, кроме названий промоушенов (UFC, LFA и т.п.), без ставок и коэффициентов.",
    "",
    `Name: ${fighter.name}`,
    `Nickname: ${fighter.nickname || ""}`,
    `Country: ${fighter.country || ""}`,
    `Weight class: ${fighter.weightClass || ""}`,
    `Record: ${fighter.record || ""}`,
    `Team: ${fighter.team || ""}`,
    `Next fight: ${fighter.nextFight || ""}`
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
    bioRu: String(parsed?.bioRu || "").replace(/\s+/g, " ").trim()
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apply = Boolean(args.apply);
  const daysForward = Number.parseInt(args["days-forward"] || "21", 10);
  const until = new Date(Date.now() + daysForward * 86_400_000);

  const fights = await prisma.fight.findMany({
    where: { event: { status: "upcoming", date: { lte: until } } },
    select: {
      fighterA: true,
      fighterB: true,
      event: { select: { name: true, date: true } }
    }
  });
  const fighters = new Map();
  for (const fight of fights) {
    for (const [fighter, opponent] of [
      [fight.fighterA, fight.fighterB],
      [fight.fighterB, fight.fighterA]
    ]) {
      if (!fighter || isPlaceholder(fighter.slug)) continue;
      if (args["fighter-slug"] && fighter.slug !== args["fighter-slug"]) continue;
      if (fighter.nameRu && String(fighter.bio || "").trim()) continue;
      const nextFight = `${fight.event.name}, ${fight.event.date.toISOString().slice(0, 10)}, vs ${opponent?.name || "TBA"}`;
      fighters.set(fighter.id, { ...fighter, nextFight });
    }
  }

  const results = [];
  for (const fighter of fighters.values()) {
    let ai = null;
    try {
      ai = await localizeWithBridge(fighter);
    } catch (error) {
      console.error(`[ai failed] ${fighter.slug}: ${error.message || error}`);
    }

    const manualName = getManualRussianName(fighter.name);
    const aiName = ai && isAcceptableRussianName(ai.nameRu, fighter.name) ? ai.nameRu : null;
    const nameRu = fighter.nameRu || manualName || aiName || transliterateName(fighter.name);
    const nameSource = fighter.nameRu ? "kept" : manualName ? "manual" : aiName ? "ai" : "translit";

    let bio = String(fighter.bio || "").trim();
    let bioSource = "kept";
    if (!bio) {
      if (ai && isAcceptableRussianBio(ai.bioRu, nameRu)) {
        bio = ai.bioRu;
        bioSource = "ai";
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

    results.push({ slug: fighter.slug, nameSource, bioSource });
    console.log(`[${apply ? "update" : "would update"}] ${fighter.slug}: ${fighter.name} → ${nameRu} (${nameSource}), bio ${bioSource}`);
    if (!apply) {
      console.log(`    ${bio}`);
      if (ai && bioSource === "template") console.log(`    [rejected ai bio] ${ai.bioRu || "<empty>"}`);
      if (ai && nameSource === "translit") console.log(`    [rejected ai name] ${ai.nameRu || "<empty>"}`);
    }

    if (apply) {
      await prisma.fighter.update({ where: { id: fighter.id }, data: { nameRu, bio } });
    }
  }

  console.log(
    JSON.stringify({
      checked: fighters.size,
      updated: apply ? results.length : 0,
      ai: results.filter((item) => item.nameSource === "ai").length,
      translit: results.filter((item) => item.nameSource === "translit").length,
      templateBio: results.filter((item) => item.bioSource === "template").length
    })
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
