#!/usr/bin/env node
/**
 * Удаляет все статьи-прогнозы: категория "analysis" с тегом "preview"
 * или с источником "FightBase AI".
 *
 * Использование:
 *   node scripts/clear-predictions.js
 *   node scripts/clear-predictions.js --dry-run
 */

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const articles = await prisma.article.findMany({
    where: {
      category: "analysis",
      OR: [
        { tagMap: { some: { tag: { slug: "preview" } } } },
        { sourceMap: { some: { source: { label: "FightBase AI" } } } }
      ]
    },
    select: { id: true, title: true, status: true }
  });

  if (articles.length === 0) {
    console.log("Статей-прогнозов не найдено.");
    return;
  }

  console.log(`Найдено статей для удаления: ${articles.length}`);
  for (const a of articles) {
    console.log(`  [${a.status}] ${a.title}`);
  }

  if (dryRun) {
    console.log("\n--dry-run: удаление не выполнено.");
    return;
  }

  const ids = articles.map((a) => a.id);

  const { count } = await prisma.article.deleteMany({
    where: { id: { in: ids } }
  });

  console.log(`\nУдалено: ${count}`);
}

main()
  .catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
