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
const { enrichFighter, needsEspnBackfill, ESPN_FIGHTER_SELECT, REQUEST_DELAY_MS, sleep } = require("./espn-enrich");

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
    select: ESPN_FIGHTER_SELECT
  });

  // Сначала самые залежавшиеся профили — чтобы лимит расходовался с пользой.
  const backlog = fighters
    .filter(needsEspnBackfill)
    .sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt));
  const batch = limit ? backlog.slice(0, limit) : backlog;

  console.log(
    `Статусы: ${statuses.join(", ")}. С espnId: ${fighters.length}, требуют обогащения: ${backlog.length}, в партии: ${batch.length}${dryRun ? " (сухой прогон)" : ""}`
  );

  let enriched = 0;
  let noData = 0;
  let photoFailed = 0;
  let failed = 0;

  for (const fighter of batch) {
    try {
      const result = await enrichFighter(prisma, fighter, fighter.espnId, dryRun);
      if (result.photoError) {
        photoFailed += 1;
        console.warn(`[ошибка фото] ${fighter.slug}: ${result.photoError}; заполнены поля: ${result.filledFields.join(", ") || "нет"}`);
      } else if (result.filledFields.length > 0) {
        enriched += 1;
      } else {
        noData += 1;
        console.log(`[нет данных для заполнения] ${fighter.slug}`);
      }
    } catch (error) {
      failed += 1;
      console.warn(`[ошибка] ${fighter.slug}: ${error.message || error}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  console.log("");
  console.log(`Итог: обогащено=${enriched} без_заполнения=${noData} ошибок_фото=${photoFailed} ошибок=${failed}${dryRun ? " (сухой прогон: планируемые результаты)" : ""}`);

  // Отсутствие данных у ESPN — не сбой. Ошибки всей партии, включая фото, — сбой.
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
