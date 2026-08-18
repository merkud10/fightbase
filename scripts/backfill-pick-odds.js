#!/usr/bin/env node

// Бэкфилл кэфов пика для снапшотов, созданных до появления полей
// oddsAAtPick/oddsBAtPick: копируем текущие кэфы боя из Fight.oddsA/oddsB.
// Для завершённых боёв это фактически закрывающая линия — честная нижняя
// оценка; дальше кэфы фиксируются в момент появления пика автоматически
// (generate-prediction-snapshots.js).
//
// Запуск: node scripts/backfill-pick-odds.js [--dry true]

const { PrismaClient } = require("@prisma/client");

const { parseArgs } = require("./fighter-import-utils");

const prisma = new PrismaClient();

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = String(args.dry || "false") === "true";

  const snapshots = await prisma.fightPredictionSnapshot.findMany({
    where: {
      aiPickFighterId: { not: null },
      oddsAAtPick: null
    },
    select: {
      id: true,
      fight: {
        select: { slug: true, oddsA: true, oddsB: true }
      }
    }
  });

  console.log(`Snapshots with a pick and no frozen odds: ${snapshots.length}`);

  let updated = 0;
  let skippedNoOdds = 0;

  for (const snapshot of snapshots) {
    const { oddsA, oddsB } = snapshot.fight || {};
    if (!(oddsA > 1) || !(oddsB > 1)) {
      skippedNoOdds += 1;
      continue;
    }

    if (dryRun) {
      console.log(`[dry] ${snapshot.fight.slug}: ${oddsA.toFixed(2)} / ${oddsB.toFixed(2)}`);
    } else {
      await prisma.fightPredictionSnapshot.update({
        where: { id: snapshot.id },
        data: { oddsAAtPick: oddsA, oddsBAtPick: oddsB }
      });
    }
    updated += 1;
  }

  console.log("");
  console.log(`Frozen: ${updated}${dryRun ? " (dry run)" : ""}, skipped (no fight odds): ${skippedNoOdds}`);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
