// Чистит привязки бойцов к статьям, созданные ошибкой сопоставления по основам
// русского имени (исправлена в lib/fighter-text-match.ts):
//
//   1. обе основы имени совпадали с одним и тем же словом — менеджер «Али
//      Аскаров» привязывал статью к бойцам «Аскар Аскаров» и «Аскар Аскар»;
//   2. основа находилась подстрокой внутри постороннего слова;
//   3. имя одного бойца — начало имени другого («Аскар Аскар» / «Аскар Аскаров»),
//      и статья привязана к обоим.
//
// Удаляется только привязка, которую старое правило находило, а новое — нет, и у
// которой нет другого подтверждения в тексте (полного имени латиницей или
// кириллицей). Привязки, не объяснимые ни старым, ни новым правилом, не трогаем:
// их источник другой (ручная правка, слаги от ИИ-дискавери).
//
//   npx tsx scripts/repair-article-fighter-links.ts            # сухой прогон
//   npx tsx scripts/repair-article-fighter-links.ts --apply    # запись

import { PrismaClient } from "@prisma/client";

import { dropPrefixShadowedFighters, russianNameStems, textMentionsRussianName } from "../lib/fighter-text-match";
import { normalizeComparableText } from "../lib/pipeline";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

type LinkedFighter = { id: string; slug: string; name: string; nameRu: string | null; nickname: string | null };

// Копия правила до исправления — только чтобы узнать привязки, которые оно создало.
function legacyRussianMatch(nameRu: string, text: string) {
  const stems = russianNameStems(nameRu);
  if (stems.length >= 2) {
    const positions = stems.map((stem) => text.indexOf(stem));
    return positions.every((position) => position >= 0) && Math.max(...positions) - Math.min(...positions) <= 80;
  }
  return stems.length === 1 && (stems[0]?.length ?? 0) >= 6 && text.includes(stems[0] ?? "");
}

function hasFullNameAlias(fighter: LinkedFighter, text: string) {
  return [fighter.slug, fighter.name, fighter.nameRu, fighter.nickname]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => {
      const normalized = normalizeComparableText(value);
      return [normalized, normalized.replace(/\s+/g, "-"), normalized.replace(/-/g, " ")];
    })
    .some((alias) => alias.split(" ").length >= 2 && text.includes(alias));
}

async function main() {
  const articles = await prisma.article.findMany({
    where: { fighterMap: { some: {} } },
    select: {
      id: true,
      slug: true,
      title: true,
      excerpt: true,
      publishedAt: true,
      sections: { select: { body: true } },
      fighterMap: { select: { fighter: { select: { id: true, slug: true, name: true, nameRu: true, nickname: true } } } }
    }
  });

  const removals: Array<{ articleId: string; fighterId: string; article: string; fighter: string; reason: string }> = [];

  for (const article of articles) {
    const text = normalizeComparableText(
      `${article.title} ${article.excerpt} ${article.sections.map((section) => section.body).join(" ")}`
    ).replace(/ё/g, "е");
    const fighters = article.fighterMap.map((item) => item.fighter);
    const kept = new Set(dropPrefixShadowedFighters(fighters).map((fighter) => fighter.id));

    for (const fighter of fighters) {
      if (!kept.has(fighter.id)) {
        removals.push({ articleId: article.id, fighterId: fighter.id, article: article.slug, fighter: fighter.slug, reason: "имя — начало имени другого бойца статьи" });
        continue;
      }
      if (!fighter.nameRu || hasFullNameAlias(fighter, text)) continue;
      if (legacyRussianMatch(fighter.nameRu.replace(/ё/g, "е"), text) && !textMentionsRussianName(fighter.nameRu, text)) {
        removals.push({ articleId: article.id, fighterId: fighter.id, article: article.slug, fighter: fighter.slug, reason: "совпадение по одному слову или подстроке" });
      }
    }
  }

  const byFighter = new Map<string, number>();
  for (const item of removals) byFighter.set(item.fighter, (byFighter.get(item.fighter) ?? 0) + 1);

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        articlesChecked: articles.length,
        linksChecked: articles.reduce((sum, article) => sum + article.fighterMap.length, 0),
        toRemove: removals.length,
        byFighter: Object.fromEntries([...byFighter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)),
        sample: removals.slice(0, 25).map((item) => `${item.fighter} <- ${item.article.slice(0, 70)} (${item.reason})`)
      },
      null,
      1
    )
  );

  if (!apply) return;

  for (const item of removals) {
    await prisma.articleFighter.delete({ where: { articleId_fighterId: { articleId: item.articleId, fighterId: item.fighterId } } });
  }
  console.log(`removed ${removals.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
