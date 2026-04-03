#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434/api/generate";
const DEFAULT_MODEL = "qwen2.5:14b";
const DEFAULT_BASE_URL = process.env.INGEST_BASE_URL || "http://localhost:3000";
const MAX_BODY_LENGTH = 6500;

function readEnvValueFromFile(name) {
  try {
    const envPath = path.join(process.cwd(), ".env");
    const contents = fs.readFileSync(envPath, "utf8");
    const match = contents.match(new RegExp(`^${name}="?([^"\\r\\n]+)"?$`, "m"));
    return match?.[1]?.trim() || "";
  } catch {
    return "";
  }
}

function readEnv(name, fallback = "") {
  return process.env[name] || readEnvValueFromFile(name) || fallback;
}

function sanitizeJsonPayload(value) {
  const raw = String(value || "").trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced?.[1]?.trim() ?? raw;
}

function parseJsonObject(value) {
  const sanitized = sanitizeJsonPayload(value);
  try {
    return JSON.parse(sanitized);
  } catch {
    const start = sanitized.indexOf("{");
    const end = sanitized.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(sanitized.slice(start, end + 1));
    }
    throw new Error("Invalid JSON from model");
  }
}

function getLetterStats(value) {
  const cyrillic = (String(value || "").match(/[А-Яа-яЁё]/g) || []).length;
  const latin = (String(value || "").match(/[A-Za-z]/g) || []).length;
  return { cyrillic, latin, total: cyrillic + latin };
}

function looksMostlyRussian(value) {
  const stats = getLetterStats(value);
  if (stats.total === 0) {
    return false;
  }
  return stats.cyrillic / stats.total >= 0.55;
}

const RED_FLAG_RULES = [
  { label: "leftover_english_term", pattern: /\b(?:eligible|athletic commission)\b/i },
  {
    label: "raw_weight_class_english",
    pattern: /\b(?:featherweight|bantamweight|welterweight|middleweight|lightweight|heavyweight|flyweight)\b/i
  },
  { label: "bad_name_variant", pattern: /\b(?:\u0410\u0439\u0441\u0443\u043b\u0442\u0430\u043d|\u0426\u0441\u0430\u0440\u0443\u043a\u044f\u043d)\b/i },
  { label: "bad_chris_variant", pattern: /\b\u0427\u0440\u0438\u0441(?:\u0430|\u0443|\u043e\u043c|\u0435)?\b/i },
  {
    label: "bad_editorial_wording",
    pattern: /\b(?:\u043c\u0430\u0440\u0448\u0438\u0441\u0442|\u0432\u0435\u043b\u043e\u0432\u0435\u0441|\u0444\u044d\u0437\u0435\u0440\u0432\u0435\u0439\u0442)\b/i
  },
  { label: "multi_option_answer", pattern: /(?:^|\n)\s*(?:\*\*)?\u0412\u0430\u0440\u0438\u0430\u043d\u0442\s+\d/i }
];

function collectRedFlags(value) {
  return RED_FLAG_RULES.filter((rule) => rule.pattern.test(String(value || ""))).map((rule) => rule.label);
}

function enforceNameCorrections(value) {
  return String(value || "")
    .replace(/\bЧриса\b/gi, "Криса")
    .replace(/\bЧрису\b/gi, "Крису")
    .replace(/\bЧрисом\b/gi, "Крисом")
    .replace(/\bЧрисе\b/gi, "Крисе")
    .replace(/\bЧрис\b/gi, "Крис");
}

function buildFighterStatLine(fighter) {
  const parts = [
    `рекорд ${fighter.record || "—"}`,
    fighter.sigStrikesLandedPerMin != null ? `SLpM ${fighter.sigStrikesLandedPerMin.toFixed(2)}` : "",
    fighter.strikeAccuracy != null ? `точность ударов ${Math.round(fighter.strikeAccuracy)}%` : "",
    fighter.takedownAveragePer15 != null ? `TD/15 ${fighter.takedownAveragePer15.toFixed(2)}` : ""
  ].filter(Boolean);
  return `${fighter.name}: ${parts.join(", ")}`;
}

async function generateBody(fight) {
  const url = readEnv("OLLAMA_URL", DEFAULT_OLLAMA_URL);
  const model = readEnv("OLLAMA_MODEL", readEnv("PREDICTION_REWRITE_MODEL", DEFAULT_MODEL));

  const prompt = [
    "Ты редактор русскоязычного MMA-медиа.",
    "Напиши прогноз и разбор ТОЛЬКО этого боя — 4–6 абзацев естественного русского текста без markdown.",
    "Используй только факты из блока данных ниже. Не выдумывай травмы, инсайды и цитаты.",
    "Не упоминай никакие букмекерские коэффициенты, числовые линии или рыночные цены.",
    "Используй нормальные русские редакционные формулировки без смеси языков.",
    "Не искажай имена и термины. Нельзя писать Айсултан Махачев, Цсарукян, маршист, веловес, фэзервейт.",
    "Верни строго JSON с одним ключом: body (строка с переносами \\n\\n между абзацами).",
    "",
    `Турнир: ${fight.event.name}`,
    `Промоушен: ${fight.event.promotion?.shortName || fight.event.promotion?.name || ""}`,
    `Дата события: ${fight.event.date.toISOString().slice(0, 10)}`,
    `Весовая: ${fight.weightClass}`,
    "",
    buildFighterStatLine(fight.fighterA),
    buildFighterStatLine(fight.fighterB),
    "",
    "Пиши связный материал: вступление, сильные стороны каждого, как может развиться бой, осторожный вывод."
  ].join("\n");
  const normalizedPrompt = `${prompt}\n\nРРјСЏ Chris РІСЃРµРіРґР° РїРёС€Рё РєР°Рє РљСЂРёСЃ, Р° РЅРµ Р§СЂРёСЃ.`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      format: "json",
      options: { temperature: 0.35 },
      prompt: normalizedPrompt
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama HTTP ${response.status}`);
  }

  const payload = await response.json();
  const parsed = parseJsonObject(payload.response || "");
  let body = String(parsed.body || "").trim();
  if (Array.isArray(parsed.body)) {
    body = parsed.body.join("\n\n").trim();
  }

  if (!body) {
    throw new Error("Пустой body от модели");
  }

  if (!looksMostlyRussian(body)) {
    const fix = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        format: "json",
        options: { temperature: 0.2 },
        prompt: [
          "Перепиши текст на чистый русский язык. Сохрани смысл. JSON с ключом body.",
          body.slice(0, 8000)
        ].join("\n\n")
      })
    });
    const fixPayload = await fix.json();
    const fixParsed = parseJsonObject(fixPayload.response || "");
    body = String(fixParsed.body || "").trim();
  }

  const redFlags = collectRedFlags(body);
  if (redFlags.length > 0) {
    const fix = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        format: "json",
        options: { temperature: 0.15 },
        prompt: [
          "Перепиши текст для серьезного русскоязычного MMA-медиа.",
          "Сохрани все факты, но убери мусорные термины, иноязычные вставки и кривые имена.",
          `Найденные проблемы: ${redFlags.join(", ")}`,
          "Верни JSON с ключом body.",
          body.slice(0, 8000)
        ].join("\n\n")
      })
    });
    const fixPayload = await fix.json();
    const fixParsed = parseJsonObject(fixPayload.response || "");
    body = String(fixParsed.body || "").trim();
  }

  return enforceNameCorrections(body).slice(0, MAX_BODY_LENGTH);
}

async function fightAlreadyCovered(fight) {
  const article = await prisma.article.findFirst({
    where: {
      category: "analysis",
      status: "published",
      eventId: fight.eventId,
      fighterMap: {
        some: { fighterId: fight.fighterAId }
      },
      AND: [
        {
          fighterMap: {
            some: { fighterId: fight.fighterBId }
          }
        }
      ]
    },
    select: { id: true }
  });
  return Boolean(article);
}

async function postDraft(baseUrl, item) {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/ingest/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `HTTP ${response.status}`);
  }
  return payload;
}

function parseArgs(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    days: 45,
    limit: 40,
    dryRun: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--base-url" && argv[i + 1]) {
      options.baseUrl = argv[i + 1];
      i += 1;
    } else if (argv[i] === "--days" && argv[i + 1]) {
      options.days = Number(argv[i + 1]) || options.days;
      i += 1;
    } else if (argv[i] === "--limit" && argv[i + 1]) {
      options.limit = Number(argv[i + 1]) || options.limit;
      i += 1;
    } else if (argv[i] === "--dry-run") {
      options.dryRun = true;
    }
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const threshold = new Date(Date.now() + options.days * 24 * 60 * 60 * 1000);

  const fights = await prisma.fight.findMany({
    where: {
      oddsA: { not: null },
      oddsB: { not: null },
      status: "scheduled",
      event: {
        status: "upcoming",
        date: { lte: threshold }
      }
    },
    include: {
      event: { include: { promotion: true } },
      fighterA: true,
      fighterB: true
    },
    orderBy: [{ event: { date: "asc" } }, { createdAt: "asc" }],
    take: options.limit
  });

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const fight of fights) {
    if (await fightAlreadyCovered(fight)) {
      skipped += 1;
      continue;
    }

    try {
      if (options.dryRun) {
        console.log(`[dry-run] ${fight.event.slug} | ${fight.fighterA.name} vs ${fight.fighterB.name}`);
        continue;
      }

      const body = await generateBody(fight);
      const headline = `${fight.fighterA.name} — ${fight.fighterB.name}: прогноз и разбор боя на ${fight.event.name}`;
      const base = options.baseUrl.replace(/\/$/, "");
      const sourceUrl = `${base}/ru/events/${fight.event.slug}`;
      const cover =
        fight.fighterA.photoUrl ||
        fight.fighterB.photoUrl ||
        "https://images.unsplash.com/photo-1549719386-74dfcbf7a31e?w=1200&q=80";

      const payload = await postDraft(options.baseUrl, {
        headline,
        body,
        publishedAt: new Date().toISOString(),
        sourceLabel: "FightBase AI",
        sourceUrl,
        coverImageUrl: cover,
        coverImageAlt: `${fight.fighterA.name} vs ${fight.fighterB.name}`,
        sourceType: "press_release",
        category: "analysis",
        promotionSlug: fight.event.promotion.slug,
        eventSlug: fight.event.slug,
        fighterSlugs: [fight.fighterA.slug, fight.fighterB.slug],
        tagSlugs: ["preview"],
        status: "published"
      });

      if (payload.draft?.duplicate) {
        skipped += 1;
      } else {
        created += 1;
        console.log(`[ok] ${payload.draft?.slug || "?"} | ${fight.fighterA.name} vs ${fight.fighterB.name}`);
      }
    } catch (e) {
      failed += 1;
      console.error(`[fail] ${fight.event.slug} ${fight.fighterA.name} vs ${fight.fighterB.name}: ${e.message || e}`);
    }
  }

  console.log("");
  console.log(`Created: ${created}, skipped: ${skipped}, failed: ${failed}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
