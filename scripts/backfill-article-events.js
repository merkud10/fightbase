#!/usr/bin/env node

// Бэкфилл привязки статей к турнирам по номерному коду («UFC 330») в заголовке
// или лиде. Покрывает статьи, опубликованные до фикса матчинга событий в
// ингесте (matchEventByNumberedCode в lib/ingestion.ts).
//
// Запуск: node scripts/backfill-article-events.js [--dry true]

const { PrismaClient } = require("@prisma/client");

const { parseArgs } = require("./fighter-import-utils");

const prisma = new PrismaClient();

function buildCodePattern(eventName) {
  const match = String(eventName || "").match(/^UFC\s+(\d+)(?:\D|$)/i);
  if (!match) {
    return null;
  }
  return new RegExp(`(?:^|\\D)UFC[\\s -]?${match[1]}(?:\\D|$)`, "i");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = String(args.dry || "false") === "true";

  const events = await prisma.event.findMany({ select: { id: true, slug: true, name: true } });
  const numberedEvents = events
    .map((event) => ({ ...event, pattern: buildCodePattern(event.name) }))
    .filter((event) => event.pattern);

  const articles = await prisma.article.findMany({
    where: { eventId: null },
    select: { id: true, slug: true, title: true, excerpt: true }
  });

  console.log(`Events with numbered codes: ${numberedEvents.length}, unlinked articles: ${articles.length}`);

  let linked = 0;
  let ambiguous = 0;

  for (const article of articles) {
    const haystack = `${article.title} ${article.excerpt || ""}`;
    const matches = numberedEvents.filter((event) => event.pattern.test(haystack));

    if (matches.length === 1) {
      const event = matches[0];
      if (dryRun) {
        console.log(`[dry] ${article.slug} -> ${event.slug}`);
      } else {
        await prisma.article.update({ where: { id: article.id }, data: { eventId: event.id } });
        console.log(`[linked] ${article.slug} -> ${event.slug}`);
      }
      linked += 1;
    } else if (matches.length > 1) {
      ambiguous += 1;
      console.log(`[ambiguous] ${article.slug}: ${matches.map((event) => event.slug).join(", ")}`);
    }
  }

  console.log("");
  console.log(`Linked: ${linked}${dryRun ? " (dry run)" : ""}, ambiguous skipped: ${ambiguous}`);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
