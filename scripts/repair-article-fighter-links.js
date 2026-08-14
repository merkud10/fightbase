#!/usr/bin/env node
// Чистка ложных привязок «Бойцы в материале»: удаляет ArticleFighter-связи, у которых
// ни один значимый токен имени бойца не встречается в тексте статьи (та же логика, что
// hasFighterTextEvidence в lib/ingestion.ts — держать в синхроне).
// По умолчанию dry-run: печатает, что будет удалено. Реальное удаление: --apply

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function normalizeForMatch(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasFighterTextEvidence(fighter, normalizedText) {
  const haystack = normalizedText.replace(/ё/g, "е");
  const tokens = [fighter.slug, fighter.name, fighter.nameRu, fighter.nickname]
    .filter(Boolean)
    .flatMap((value) => normalizeForMatch(String(value)).split(/[\s-]+/));

  return tokens.some((token) => {
    const normalizedToken = token.replace(/ё/g, "е");
    if (normalizedToken.length < 4) {
      return false;
    }
    const stem =
      normalizedToken.length >= 7
        ? normalizedToken.slice(0, -2)
        : normalizedToken.length >= 5
          ? normalizedToken.slice(0, -1)
          : normalizedToken;
    return haystack.includes(stem);
  });
}

async function main() {
  const apply = process.argv.includes("--apply");

  const articles = await prisma.article.findMany({
    where: { fighterMap: { some: {} } },
    select: {
      id: true,
      slug: true,
      title: true,
      sections: { select: { body: true }, orderBy: { sortOrder: "asc" } },
      fighterMap: {
        select: {
          fighterId: true,
          fighter: { select: { slug: true, name: true, nameRu: true, nickname: true } }
        }
      }
    }
  });

  let checkedLinks = 0;
  let badLinks = 0;
  const deletions = [];

  for (const article of articles) {
    const text = normalizeForMatch(`${article.title} ${article.sections.map((section) => section.body).join(" ")}`);

    for (const link of article.fighterMap) {
      checkedLinks += 1;
      if (!hasFighterTextEvidence(link.fighter, text)) {
        badLinks += 1;
        deletions.push({ articleId: article.id, fighterId: link.fighterId });
        console.log(`BAD  ${article.slug} -> ${link.fighter.name} (${link.fighter.nameRu || "-"})`);
      }
    }
  }

  console.log("");
  console.log(`Articles with links: ${articles.length}`);
  console.log(`Links checked: ${checkedLinks}`);
  console.log(`Links without text evidence: ${badLinks}`);

  if (!apply) {
    console.log("Dry-run: ничего не удалено. Запусти с --apply для удаления.");
    return;
  }

  let deleted = 0;
  for (const target of deletions) {
    const result = await prisma.articleFighter.deleteMany({
      where: { articleId: target.articleId, fighterId: target.fighterId }
    });
    deleted += result.count;
  }

  console.log(`Deleted links: ${deleted}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
