#!/usr/bin/env node

/**
 * Находит статьи-дубли по одному и тому же sourceUrl (из ingestionSourceSummary).
 * Из каждой группы дублей оставляет самую раннюю (по createdAt), остальные удаляет.
 *
 * Запуск:
 *   node scripts/delete-url-duplicates.js          — dry-run (только показать)
 *   node scripts/delete-url-duplicates.js --apply   — реально удалить
 */

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function extractUrl(summary) {
  if (!summary) return null;
  const m = summary.match(/URL:\s*(\S+)/);
  return m ? m[1] : null;
}

async function main() {
  const apply = process.argv.includes("--apply");

  const articles = await prisma.article.findMany({
    where: { ingestionSourceSummary: { not: null } },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      ingestionSourceSummary: true,
      createdAt: true,
      sourceMap: { select: { sourceId: true } }
    },
    orderBy: { createdAt: "asc" }
  });

  // Группируем по sourceUrl + sourceId
  const groups = new Map();

  for (const article of articles) {
    const url = extractUrl(article.ingestionSourceSummary);
    if (!url) continue;

    for (const sm of article.sourceMap) {
      const key = `${sm.sourceId}::${url}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(article);
    }
  }

  const toDelete = [];

  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    // Оставляем первую (самую старую), остальные — дубли
    const [keep, ...duplicates] = group;
    for (const dup of duplicates) {
      toDelete.push({ ...dup, keepSlug: keep.slug, sourceUrl: key.split("::")[1] });
    }
  }

  if (toDelete.length === 0) {
    console.log("Дублей по URL не найдено.");
    return;
  }

  console.log(`Найдено дублей: ${toDelete.length}\n`);

  for (const dup of toDelete) {
    console.log(`DELETE  ${dup.slug}`);
    console.log(`  title:  ${dup.title}`);
    console.log(`  status: ${dup.status}`);
    console.log(`  url:    ${dup.sourceUrl}`);
    console.log(`  keep:   ${dup.keepSlug}`);
    console.log();
  }

  if (!apply) {
    console.log("Dry-run. Для удаления запустите с --apply");
    return;
  }

  for (const dup of toDelete) {
    await prisma.article.delete({ where: { id: dup.id } });
    console.log(`Удалена: ${dup.slug}`);
  }

  console.log(`\nУдалено: ${toDelete.length}`);
}

main()
  .catch((error) => {
    console.error(error?.message || error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
