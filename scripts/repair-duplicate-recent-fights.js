#!/usr/bin/env node

// Схлопывает задвоенные бои в истории: один и тот же соперник, даты в пределах
// суток. Источники записывали бой по-разному — с датой турнира и без, с полным
// названием и сокращённым, — а сдвиг на день приходит из разницы часовых поясов.
//
// Из пары остаётся более полная строка: заметки ценнее метода, метод ценнее
// раунда. При равенстве побеждает более ранняя запись.
//
// По умолчанию dry-run, запись только с --apply.

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeOpponent(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^by\s+/, "")
    .replace(/[^a-zа-яё0-9]+/gi, " ")
    .trim();
}

// Чем больше заполнено, тем ценнее строка.
function richness(row) {
  let score = 0;
  if (String(row.notes || "").trim()) score += 8;
  if (String(row.method || "").trim()) score += 4;
  if (row.round != null) score += 2;
  if (String(row.time || "").trim()) score += 1;
  if (row.result !== "Результат уточняется") score += 16;
  return score;
}

async function main() {
  const apply = process.argv.includes("--apply");

  const fighters = await prisma.fighter.findMany({
    select: {
      slug: true,
      recentFights: {
        select: { id: true, opponentName: true, eventName: true, result: true, method: true, date: true, round: true, time: true, notes: true, createdAt: true }
      }
    }
  });

  const toDelete = [];
  const samples = [];

  for (const fighter of fighters) {
    const groups = [];

    for (const row of fighter.recentFights) {
      const opponent = normalizeOpponent(row.opponentName);
      const group = groups.find(
        (candidate) =>
          candidate.opponent === opponent &&
          candidate.rows.some((member) => Math.abs(member.date.getTime() - row.date.getTime()) <= DAY_MS)
      );

      if (group) {
        group.rows.push(row);
      } else {
        groups.push({ opponent, rows: [row] });
      }
    }

    for (const group of groups) {
      if (group.rows.length < 2) {
        continue;
      }

      const ordered = [...group.rows].sort((left, right) => {
        const diff = richness(right) - richness(left);
        return diff !== 0 ? diff : left.createdAt.getTime() - right.createdAt.getTime();
      });

      const [keep, ...drop] = ordered;
      toDelete.push(...drop.map((row) => row.id));

      if (samples.length < 8) {
        samples.push({
          slug: fighter.slug,
          opponent: keep.opponentName,
          keep: `${keep.date.toISOString().slice(0, 10)} ${keep.result} «${keep.eventName}»`,
          drop: drop.map((row) => `${row.date.toISOString().slice(0, 10)} ${row.result} «${row.eventName}»`)
        });
      }
    }
  }

  if (!apply) {
    console.log(JSON.stringify({ mode: "dry-run", rowsToDelete: toDelete.length, samples }, null, 1));
    return;
  }

  const deleted = await prisma.fighterRecentFight.deleteMany({ where: { id: { in: toDelete } } });
  console.log(JSON.stringify({ mode: "apply", deleted: deleted.count }, null, 1));
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
