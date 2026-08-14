#!/usr/bin/env node
// Диагностика привязок «Бойцы в материале»: для статьи показывает, какой боец
// прошёл бы текстовый матчер lib/ingestion.ts и ЧЕМ именно (алиас или стемы),
// а также какие текущие привязки текстом не подтверждаются.
// Запуск: node scripts/diagnose-fighter-links.js --article <slug>

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

// Копия lib/pipeline.ts normalizeForMatch — держать в синхроне.
function normalizeForMatch(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueItems(list) {
  return [...new Set(list)];
}

function buildAliases(values) {
  return uniqueItems(
    values
      .flatMap((value) => {
        if (!value) return [];
        const normalized = normalizeForMatch(value);
        const slugStyle = normalized.replace(/\s+/g, "-");
        return [normalized, slugStyle, normalized.replace(/-/g, " ")];
      })
      .filter(Boolean)
  );
}

function russianStems(nameRu) {
  const words = nameRu.toLowerCase().trim().split(/\s+/);
  const stems = [];
  for (const word of words) {
    if (word.length >= 7) {
      stems.push(word.slice(0, -2));
    } else if (word.length >= 6) {
      stems.push(word.slice(0, -1));
    } else if (word.length >= 5) {
      stems.push(word);
    }
  }
  return stems;
}

function explainMatch(fighter, text) {
  const aliases = buildAliases([fighter.slug, fighter.name, fighter.nameRu, fighter.nickname]);

  for (const alias of aliases) {
    if (alias && text.includes(alias) && alias.split(" ").length >= 2) {
      const at = text.indexOf(alias);
      return { matched: true, via: `alias "${alias}"`, context: text.slice(Math.max(0, at - 40), at + alias.length + 40) };
    }
  }

  if (fighter.nameRu) {
    const stems = russianStems(fighter.nameRu);

    if (stems.length >= 2) {
      const positions = stems.map((stem) => text.indexOf(stem));
      if (positions.every((pos) => pos >= 0)) {
        const span = Math.max(...positions) - Math.min(...positions);
        if (span <= 80) {
          const from = Math.min(...positions);
          return {
            matched: true,
            via: `stems [${stems.join(", ")}] span=${span}`,
            context: text.slice(Math.max(0, from - 30), Math.max(...positions) + 40)
          };
        }
      }
    }

    if (stems.length === 1 && (stems[0]?.length ?? 0) >= 6 && text.includes(stems[0] ?? "")) {
      const at = text.indexOf(stems[0]);
      return {
        matched: true,
        via: `single stem "${stems[0]}"`,
        context: text.slice(Math.max(0, at - 40), at + stems[0].length + 40)
      };
    }
  }

  return { matched: false };
}

async function main() {
  const slugIndex = process.argv.indexOf("--article");
  const slug = slugIndex >= 0 ? process.argv[slugIndex + 1] : null;
  if (!slug) {
    console.error("Usage: node scripts/diagnose-fighter-links.js --article <slug>");
    process.exit(1);
  }

  const article = await prisma.article.findUnique({
    where: { slug },
    include: {
      sections: { orderBy: { sortOrder: "asc" } },
      fighterMap: { include: { fighter: true } }
    }
  });

  if (!article) {
    console.error("Article not found:", slug);
    process.exit(1);
  }

  const body = article.sections.map((section) => section.body).join(" ");
  const text = normalizeForMatch(`${article.title} ${body}`);
  console.log(`Article: ${article.title}`);
  console.log(`Text length: ${text.length}`);
  console.log(`Ingestion summary: ${article.ingestionSourceSummary || "-"}`);
  console.log("");

  console.log("=== Текущие привязки ===");
  for (const { fighter } of article.fighterMap) {
    const verdict = explainMatch(fighter, text);
    if (verdict.matched) {
      console.log(`OK   ${fighter.name} (${fighter.nameRu || "-"}) — ${verdict.via}`);
      console.log(`     …${verdict.context}…`);
    } else {
      console.log(`FAIL ${fighter.name} (${fighter.nameRu || "-"}) — текстом не подтверждается`);
    }
  }

  console.log("");
  console.log("=== Кто ещё прошёл бы матчер по этому тексту ===");
  const linkedIds = new Set(article.fighterMap.map((item) => item.fighterId));
  const fighters = await prisma.fighter.findMany({
    select: { id: true, slug: true, name: true, nameRu: true, nickname: true }
  });
  for (const fighter of fighters) {
    if (linkedIds.has(fighter.id)) continue;
    const verdict = explainMatch(fighter, text);
    if (verdict.matched) {
      console.log(`EXTRA ${fighter.name} (${fighter.nameRu || "-"}) — ${verdict.via}`);
      console.log(`      …${verdict.context}…`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
