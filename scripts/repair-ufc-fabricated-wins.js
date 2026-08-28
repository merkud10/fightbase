#!/usr/bin/env node

// Чинит последствия бага карточного парсера ufc.com, который проставлял
// «Победа» всем строкам независимо от того, чей это профиль
// (см. sync-ufc-roster.js, определение исхода по классу блока бойца).
//
// Битые строки узнаются по названию турнира с датой на конце
// («UFC Fight Night March 28 2026») — карточный парсер собирал его из слага
// события, второй парсер берёт из <strong> и даты не добавляет.
//
//   1. Строки с здоровым дублем (тот же соперник, дата ±1 сутки) — удаляются:
//      исход и notes есть в парной строке.
//   2. Строки без пары — исход не подтверждён ничем, поэтому получают
//      «Результат уточняется». Это значение в списке плейсхолдеров
//      (lib/db/fighters.ts), такие строки не показываются на странице.
//      Данные остаются в базе и восстановимы.
//
// По умолчанию — dry-run. Реальная запись только с --apply.

const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const DAY_MS = 24 * 60 * 60 * 1000;
const UNVERIFIED_RESULT = "Результат уточняется";

const apply = process.argv.includes("--apply");
const backupDir = process.env.REPAIR_BACKUP_DIR || "/opt/fightbase/backups";

function isDatedEventName(value) {
  return /^(19|20)[0-9][0-9]/.test(String(value || "").trim().slice(-4));
}

function normalizeOpponent(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/^by\s+/, "")
    .replace(/[^a-zа-яё0-9]+/gi, " ")
    .trim();
}

async function main() {
  const fighters = await prisma.fighter.findMany({
    select: {
      slug: true,
      recentFights: {
        select: {
          id: true,
          opponentName: true,
          opponentNameRu: true,
          eventName: true,
          result: true,
          method: true,
          date: true,
          round: true,
          time: true,
          weightClass: true,
          notes: true
        }
      }
    }
  });

  const toDelete = [];
  const toBlank = [];

  for (const fighter of fighters) {
    const dated = fighter.recentFights.filter((fight) => isDatedEventName(fight.eventName));
    if (dated.length === 0) {
      continue;
    }

    const plain = fighter.recentFights.filter((fight) => !isDatedEventName(fight.eventName));

    for (const fight of dated) {
      const twin = plain.find(
        (candidate) =>
          normalizeOpponent(candidate.opponentName) === normalizeOpponent(fight.opponentName) &&
          Math.abs(candidate.date.getTime() - fight.date.getTime()) <= DAY_MS
      );

      if (twin) {
        toDelete.push(fight.id);
      } else if (fight.result !== UNVERIFIED_RESULT) {
        toBlank.push(fight.id);
      }
    }
  }

  const summary = {
    mode: apply ? "apply" : "dry-run",
    fightersScanned: fighters.length,
    rowsToDelete: toDelete.length,
    rowsToBlank: toBlank.length
  };

  if (!apply) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  // Полный снимок таблицы до записи — единственный путь отката,
  // не зависящий от ночного бэкапа.
  const affected = fighters.flatMap((fighter) =>
    fighter.recentFights
      .filter((fight) => toDelete.includes(fight.id) || toBlank.includes(fight.id))
      .map((fight) => ({ fighterSlug: fighter.slug, ...fight }))
  );

  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `fighter-recent-fights-before-repair-${process.pid}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(affected, null, 1), "utf8");

  const deleted = await prisma.fighterRecentFight.deleteMany({ where: { id: { in: toDelete } } });
  const blanked = await prisma.fighterRecentFight.updateMany({
    where: { id: { in: toBlank } },
    data: { result: UNVERIFIED_RESULT }
  });

  console.log(
    JSON.stringify(
      { ...summary, backupPath, backedUpRows: affected.length, deleted: deleted.count, blanked: blanked.count },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
