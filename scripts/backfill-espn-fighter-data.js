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
