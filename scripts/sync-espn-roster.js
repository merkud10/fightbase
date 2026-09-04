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

const { parseArgs } = require("./fighter-import-utils");
const { findExactFighterMatch } = require("./fighter-name-matching");
const { collectScoreboardCompetitors } = require("./espn-roster-utils");
const { enrichFighter, fetchJson, ESPN_FIGHTER_SELECT, REQUEST_DELAY_MS, sleep } = require("./espn-enrich");

const prisma = new PrismaClient();

const SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard";
const DAYS_BACK = 45;
const DAYS_FORWARD = 60;
const CHUNK_DAYS = 30;

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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const limit = Number(args.limit || 0) || null;
  const dryRun = Boolean(args["dry-run"]) || String(args.dry || "") === "true";

  console.log("Collecting competitors from ESPN scoreboard...");
  const competitors = await collectRecentCompetitors();
  console.log(`Found ${competitors.length} athletes on recent/upcoming cards`);

  const fighters = await prisma.fighter.findMany({
    select: ESPN_FIGHTER_SELECT
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

  let updated = 0;
  let unchanged = 0;
  let photoFailed = 0;
  let failed = 0;

  for (const { fighter, espnId } of batch) {
    try {
      const result = await enrichFighter(prisma, fighter, espnId, dryRun);
      if (result.photoError) {
        photoFailed += 1;
        console.warn(`[photo failed] ${fighter.slug}: ${result.photoError}; changed fields: ${result.changedFields.join(", ") || "none"}`);
      } else if (result.changedFields.length > 0) {
        updated += 1;
      } else {
        unchanged += 1;
      }
    } catch (error) {
      failed += 1;
      console.warn(`[failed] ${fighter.slug}: ${error.message}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  console.log("");
  console.log(`Summary: updated=${updated} unchanged=${unchanged} photoFailed=${photoFailed} failed=${failed}${dryRun ? " (dry run: planned results)" : ""}`);

  // Полный провал (например, ESPN недоступен) должен ронять job — там ретраи.
  if (batch.length > 0 && failed + photoFailed === batch.length) {
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
