#!/usr/bin/env node

// Шесть бойцов заведены дважды: у второй записи русский slug от постороннего
// человека (по /fighters/kristof-dzhotko отдавался Майк Малотт). Дубли строго
// беднее канонических записей — нет espnId, нет карточек боёв.
//
// Скрипт переносит на каноническую запись привязки к статьям и удаляет дубль.
// Остальное (recentFights) уходит каскадом: у канона те же бои.
// Старые адреса уводятся 301-м из next.config.ts — список там должен
// совпадать с картой ниже.
//
// По умолчанию dry-run, запись только с --apply.

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const DUPLICATES = [
  { duplicate: "kristof-dzhotko", canonical: "mike-malott" },
  { duplicate: "kori-makkenna-6", canonical: "jasmine-jasudavicius" },
  { duplicate: "kori-makkenna-7", canonical: "julia-polastri" },
  { duplicate: "aleks-oliveyra-2", canonical: "mitch-raposo" },
  { duplicate: "shiyunia-tafua", canonical: "junior-tafa" },
  { duplicate: "lyudovit-klayn-1", canonical: "daniel-barez" }
];

const apply = process.argv.includes("--apply");

const select = {
  id: true,
  slug: true,
  name: true,
  espnId: true,
  articleMap: { select: { articleId: true } },
  _count: { select: { fightsA: true, fightsB: true, recentFights: true } }
};

async function main() {
  const planned = [];
  const skipped = [];

  for (const pair of DUPLICATES) {
    const duplicate = await prisma.fighter.findUnique({ where: { slug: pair.duplicate }, select });
    const canonical = await prisma.fighter.findUnique({ where: { slug: pair.canonical }, select });

    if (!duplicate || !canonical) {
      skipped.push({ ...pair, reason: duplicate ? "нет канонической записи" : "дубль уже удалён" });
      continue;
    }

    // Удаляем только полного тёзку — иначе это не дубль, а разные бойцы.
    if (duplicate.name !== canonical.name) {
      skipped.push({ ...pair, reason: `имена расходятся: «${duplicate.name}» и «${canonical.name}»` });
      continue;
    }

    // Дубль не должен быть богаче канона, иначе удаление потеряет данные.
    const duplicateFights = duplicate._count.fightsA + duplicate._count.fightsB;
    if (duplicateFights > 0 || duplicate.espnId) {
      skipped.push({ ...pair, reason: `дубль не беднее канона (карточек ${duplicateFights}, espnId ${duplicate.espnId})` });
      continue;
    }

    const canonicalArticles = new Set(canonical.articleMap.map((row) => row.articleId));
    const articlesToMove = duplicate.articleMap
      .map((row) => row.articleId)
      .filter((articleId) => !canonicalArticles.has(articleId));

    planned.push({ ...pair, duplicateId: duplicate.id, canonicalId: canonical.id, articlesToMove });
  }

  if (!apply) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          willDelete: planned.length,
          willMoveArticleLinks: planned.reduce((sum, item) => sum + item.articlesToMove.length, 0),
          planned: planned.map((item) => ({ ...item, articlesToMove: item.articlesToMove.length })),
          skipped
        },
        null,
        1
      )
    );
    return;
  }

  let movedLinks = 0;

  for (const item of planned) {
    if (item.articlesToMove.length > 0) {
      const created = await prisma.articleFighter.createMany({
        data: item.articlesToMove.map((articleId) => ({ articleId, fighterId: item.canonicalId })),
        skipDuplicates: true
      });
      movedLinks += created.count;
    }

    // articleMap и recentFights дубля уходят каскадом (onDelete: Cascade).
    await prisma.fighter.delete({ where: { id: item.duplicateId } });
  }

  console.log(
    JSON.stringify(
      {
        mode: "apply",
        deleted: planned.map((item) => `${item.duplicate} (дубль ${item.canonical})`),
        movedArticleLinks: movedLinks,
        skipped
      },
      null,
      1
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
