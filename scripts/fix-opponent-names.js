#!/usr/bin/env node

// Русские имена соперников в истории боёв (FighterRecentFight.opponentNameRu).
//
// У соперника со своей карточкой имя на сайте берётся из карточки
// (lib/fighter-name-index.ts). У остальных — а это ветераны и бойцы других
// лиг — в базе лежит побуквенная транслитерация синка: «Овинке Саинт Преукс»,
// «Джоанна Джедрзеджкзик», «Тирон Уоодлеи». Такие имена пишет заново модель.
//
//   --suggest --out FILE     собрать имена без карточки, спросить модель, записать JSONL
//   --profiles --out FILE    то же для имён в самих карточках (Fighter.nameRu): только расхождения
//   --apply --in FILE        записать предложения в базу; старые значения — в FILE.backup.jsonl
//   --limit N                не больше N имён за прогон
//
// Без --apply база не меняется.

const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");

const { fighterNameKey } = require("./fighter-name-matching");
const { isAcceptableRussianName } = require("./fighter-ru-profile");
const { resolvePredictionAiConfig } = require("./prediction-ai-copy");

const BATCH_SIZE = 40;
const MAX_ATTEMPTS = 3;

function readEnvValueFromFile(name) {
  try {
    const contents = fs.readFileSync(path.join(process.cwd(), ".env"), "utf8");
    const match = contents.match(new RegExp(`^${name}="?([^"\\r\\n]+)"?$`, "m"));
    return match?.[1]?.trim() || "";
  } catch {
    return "";
  }
}

function readEnv(name, fallback = "") {
  return process.env[name] || readEnvValueFromFile(name) || fallback;
}

function parseArgs(argv) {
  const options = { suggest: false, profiles: false, apply: false, out: null, in: null, limit: Infinity };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--suggest") options.suggest = true;
    if (arg === "--profiles") options.profiles = true;
    if (arg === "--apply") options.apply = true;
    if (arg === "--out" && argv[index + 1]) options.out = argv[++index];
    if (arg === "--in" && argv[index + 1]) options.in = argv[++index];
    if (arg === "--limit" && argv[index + 1]) options.limit = Number(argv[++index]) || Infinity;
  }
  return options;
}

// Имя, с которым модели есть что делать: имя и фамилия латиницей. Одиночные
// фамилии («Silva», «Smith») и мусор разбора («continue») человеком не являются.
function isRealOpponentName(name) {
  const value = String(name || "").trim();
  if (!/^\p{Lu}/u.test(value)) return false;
  if (/(?:^|\s)(?:TBA|TBD)(?:\s|$)/i.test(value)) return false;
  if (/[А-Яа-яЁё\d]/.test(value)) return false;
  // Обрывки примечаний из разбора страниц: «Pat Healy was changed», «Nicolas Dalby was overturned».
  if (/\s(?:was|were|is|by|changed|overturned|continue)(?:\s|$)/i.test(value)) return false;
  return value.split(/\s+/).filter((token) => /\p{L}{2,}/u.test(token)).length >= 2;
}

// Соперники без однозначной карточки: [{ name, current, rows }], частые первыми.
function collectUnmatchedOpponents(fighters, opponentRows) {
  const seen = new Map();
  for (const fighter of fighters) {
    const key = fighterNameKey(fighter.name);
    if (key) seen.set(key, seen.has(key) ? null : fighter);
  }
  const byName = new Map();
  for (const row of opponentRows) {
    const name = String(row.opponentName || "").trim();
    if (!isRealOpponentName(name)) continue;
    if (seen.get(fighterNameKey(name))) continue;
    const entry = byName.get(name) ?? { name, rows: 0, spellings: new Map() };
    entry.rows += row.count;
    const ru = String(row.opponentNameRu || "").trim();
    entry.spellings.set(ru, (entry.spellings.get(ru) ?? 0) + row.count);
    byName.set(name, entry);
  }
  return [...byName.values()]
    .map((entry) => ({
      name: entry.name,
      rows: entry.rows,
      current: [...entry.spellings.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ""
    }))
    .sort((a, b) => b.rows - a.rows || a.name.localeCompare(b.name));
}

function buildNamePrompt(names) {
  const system = [
    "Ты — редактор русскоязычного MMA-медиа. Для каждого бойца из списка дай написание имени по-русски.",
    "Если у бойца есть устоявшееся написание в русскоязычных спортивных СМИ и русской Википедии — используй его (Tyron Woodley — Тайрон Вудли, Joanna Jedrzejczyk — Йоанна Енджейчик, Jose Aldo — Жозе Альдо, Ovince Saint Preux — Овинс Сен-Прё).",
    "Если устоявшегося написания нет — практическая транскрипция с языка происхождения имени, а не побуквенная замена: португальские João — Жуан, José — Жозе, Thiago — Тиаго, -eira — -ейра, -ão — -ан; испанские Hernández — Эрнандес, Jorge — Хорхе; польские Błachowicz — Блахович; французские Benoît — Бенуа; английские Michael — Майкл, Anthony — Энтони, James — Джеймс.",
    "Китайские имена — по системе Палладия, фамилия первой (Zhang Weili — Чжан Вэйли); корейские — фамилия первой.",
    "Столько же слов, сколько в исходном имени; прозвища и суффиксы Jr./III не добавляй и не переводи. Только кириллица.",
    'Верни СТРОГО валидный JSON-объект без пояснений и markdown: ключ — имя из списка дословно, значение — русское написание.'
  ].join("\n");
  return { system, user: JSON.stringify(names) };
}

function parseModelJson(content) {
  const raw = String(content || "").trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = fenced?.[1]?.trim() ?? raw;
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

// Ответ модели → { name: ru } только для имён из запроса и только годных к показу.
function pickValidNames(parsed, names) {
  const result = {};
  if (!parsed || typeof parsed !== "object") return result;
  for (const name of names) {
    const value = typeof parsed[name] === "string" ? parsed[name].trim().replace(/\s+/g, " ") : "";
    if (value && isAcceptableRussianName(value, name)) result[name] = value;
  }
  return result;
}

async function askModel(names, config, fetchImpl = fetch) {
  const prompt = buildNamePrompt(names);
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        signal: AbortSignal.timeout(Math.min(config.timeoutMs ?? 120000, 180000)),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({
          model: config.model,
          temperature: 0,
          messages: [
            { role: "system", content: prompt.system },
            { role: "user", content: prompt.user }
          ]
        })
      });
      if (response.ok) {
        const payload = await response.json();
        const valid = pickValidNames(parseModelJson(payload?.choices?.[0]?.message?.content), names);
        if (Object.keys(valid).length > 0) return valid;
      }
    } catch {
      // повторим ниже
    }
    await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
  }
  return {};
}

async function suggest(prisma, options, config) {
  const fighters = await prisma.fighter.findMany({ select: { slug: true, name: true, nameRu: true } });
  let items;
  if (options.profiles) {
    items = fighters
      .filter((fighter) => isRealOpponentName(fighter.name) && fighter.nameRu)
      .map((fighter) => ({ name: fighter.name, current: fighter.nameRu, slug: fighter.slug, rows: 1 }));
  } else {
    const grouped = await prisma.fighterRecentFight.groupBy({ by: ["opponentName", "opponentNameRu"], _count: { _all: true } });
    items = collectUnmatchedOpponents(
      fighters,
      grouped.map((row) => ({ opponentName: row.opponentName, opponentNameRu: row.opponentNameRu, count: row._count._all }))
    );
  }
  items = items.slice(0, options.limit);
  console.log(`Names to check: ${items.length}`);

  const out = fs.createWriteStream(options.out, { flags: "w" });
  let changed = 0;
  let answered = 0;
  for (let offset = 0; offset < items.length; offset += BATCH_SIZE) {
    const batch = items.slice(offset, offset + BATCH_SIZE);
    const names = await askModel(batch.map((item) => item.name), config);
    for (const item of batch) {
      const suggested = names[item.name];
      if (!suggested) continue;
      answered += 1;
      if (suggested === item.current) continue;
      changed += 1;
      out.write(`${JSON.stringify({ ...item, suggested })}\n`);
    }
    console.log(`  ${Math.min(offset + BATCH_SIZE, items.length)}/${items.length}: answered ${answered}, differ ${changed}`);
  }
  await new Promise((resolve) => out.end(resolve));
  console.log(`Answered: ${answered}, differ from current: ${changed}, file: ${options.out}`);
}

async function apply(prisma, options) {
  const lines = fs.readFileSync(options.in, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const backupPath = `${options.in}.backup.jsonl`;
  const backup = fs.createWriteStream(backupPath, { flags: "a" });
  let rows = 0;
  let names = 0;
  for (const item of lines) {
    if (!isRealOpponentName(item.name) || !isAcceptableRussianName(item.suggested, item.name)) continue;
    if (item.slug) {
      const fighter = await prisma.fighter.findUnique({ where: { slug: item.slug }, select: { id: true, nameRu: true } });
      if (!fighter || fighter.nameRu === item.suggested) continue;
      backup.write(`${JSON.stringify({ table: "Fighter", id: fighter.id, old: fighter.nameRu, new: item.suggested })}\n`);
      await prisma.fighter.update({ where: { id: fighter.id }, data: { nameRu: item.suggested } });
      rows += 1;
    } else {
      const existing = await prisma.fighterRecentFight.findMany({
        where: { opponentName: item.name, NOT: { opponentNameRu: item.suggested } },
        select: { id: true, opponentNameRu: true }
      });
      if (existing.length === 0) continue;
      for (const row of existing) {
        backup.write(`${JSON.stringify({ table: "FighterRecentFight", id: row.id, old: row.opponentNameRu, new: item.suggested })}\n`);
      }
      const result = await prisma.fighterRecentFight.updateMany({ where: { id: { in: existing.map((row) => row.id) } }, data: { opponentNameRu: item.suggested } });
      rows += result.count;
    }
    names += 1;
  }
  await new Promise((resolve) => backup.end(resolve));
  console.log(`Applied names: ${names}, rows updated: ${rows}, backup: ${backupPath}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  try {
    if (options.apply) {
      if (!options.in) throw new Error("--apply needs --in FILE");
      await apply(prisma, options);
    } else if (options.suggest || options.profiles) {
      if (!options.out) throw new Error("--suggest/--profiles needs --out FILE");
      const config = resolvePredictionAiConfig(readEnv);
      if (!config) throw new Error("AI configuration is required");
      await suggest(prisma, options, { ...config, webSearch: false });
    } else {
      throw new Error("Usage: fix-opponent-names.js --suggest|--profiles --out FILE | --apply --in FILE");
    }
  } finally {
    await prisma.$disconnect();
  }
}

module.exports = { parseArgs, isRealOpponentName, collectUnmatchedOpponents, buildNamePrompt, pickValidNames, askModel };

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
