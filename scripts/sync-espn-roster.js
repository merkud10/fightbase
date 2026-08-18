#!/usr/bin/env node

// Ростер-обогащение через ESPN API. Замена серверного прогона
// sync-ufc-roster.js: ufc.com закрыт Cloudflare для IP дата-центров, а ESPN
// отвечает и с сервера (на нём же живёт весь событийный синк).
//
// Поток: скорборд за окно дат → участники боёв (espnId + имя) → матч с нашим
// ростером (по espnId, затем по нормализованному имени) → профиль атлета из
// ESPN → точечный update. nameRu, bio и status не трогаем; фото ставим только
// бойцам без фото.
//
// Запуск: node scripts/sync-espn-roster.js [--limit N] [--dry-run]

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Встроенный fetch (undici), как в sync-upcoming-events.js: node https.get
// ловит 403 от ESPN по TLS-фингерпринту, а undici проходит и локально, и с сервера.
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

function toDateStr(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

async function collectRecentCompetitors() {
  const from = new Date(Date.now() - DAYS_BACK * 24 * 60 * 60 * 1000);
  const to = new Date(Date.now() + DAYS_FORWARD * 24 * 60 * 60 * 1000);
  const byId = new Map();

  for (let start = new Date(from); start < to; ) {
    const end = new Date(Math.min(start.getTime() + CHUNK_DAYS * 24 * 60 * 60 * 1000, to.getTime()));

    try {
      const data = await fetchJson(`${SCOREBOARD_URL}?dates=${toDateStr(start)}-${toDateStr(end)}`);
      for (const competitor of collectScoreboardCompetitors(data)) {
        byId.set(competitor.espnId, competitor);
      }
    } catch (error) {
      console.warn(`Scoreboard chunk ${toDateStr(start)}-${toDateStr(end)} failed: ${error.message}`);
    }

    start = end;
    await sleep(REQUEST_DELAY_MS);
  }

  return [...byId.values()];
}

function hasUsablePhoto(url) {
  return Boolean(String(url || "").trim());
}

async function enrichFighter(fighter, espnId, dryRun) {
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const limit = Number(args.limit || 0) || null;
  const dryRun = Boolean(args["dry-run"]) || String(args.dry || "") === "true";

  console.log("Collecting competitors from ESPN scoreboard...");
  const competitors = await collectRecentCompetitors();
  console.log(`Found ${competitors.length} athletes on recent/upcoming cards`);

  const fighters = await prisma.fighter.findMany({
    select: { id: true, slug: true, name: true, espnId: true, photoUrl: true, updatedAt: true }
  });
  const byEspnId = new Map(fighters.filter((f) => f.espnId).map((f) => [f.espnId, f]));
  const candidates = fighters.map((f) => ({ id: f.id, name: f.name, slug: f.slug }));

  const matched = [];
  let unmatched = 0;

  for (const competitor of competitors) {
    const existing = byEspnId.get(competitor.espnId);
    if (existing) {
      matched.push({ fighter: existing, espnId: competitor.espnId });
      continue;
    }

    const found = findExactFighterMatch({ name: competitor.fullName }, candidates);
    if (found) {
      const fighter = fighters.find((f) => f.id === found.id);
      // Не перепривязываем бойца, за которым уже закреплён другой espnId.
      if (fighter && !fighter.espnId) {
        matched.push({ fighter, espnId: competitor.espnId });
      }
    } else {
      unmatched += 1;
    }
  }

  // Сначала самые залежавшиеся профили — чтобы лимит расходовался с пользой.
  matched.sort((a, b) => new Date(a.fighter.updatedAt) - new Date(b.fighter.updatedAt));
  const batch = limit ? matched.slice(0, limit) : matched;

  console.log(`Matched: ${matched.length}, unmatched (not in roster): ${unmatched}, enriching: ${batch.length}`);

  let ok = 0;
  let failed = 0;

  for (const { fighter, espnId } of batch) {
    try {
      await enrichFighter(fighter, espnId, dryRun);
      ok += 1;
    } catch (error) {
      failed += 1;
      console.warn(`[failed] ${fighter.slug}: ${error.message}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  console.log("");
  console.log(`Summary: enriched=${ok} failed=${failed}${dryRun ? " (dry run)" : ""}`);

  // Полный провал (например, ESPN недоступен) должен ронять job — там ретраи.
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
