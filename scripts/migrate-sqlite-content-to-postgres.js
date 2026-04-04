#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function resolveSqliteSourcePath() {
  const sourcePath = process.env.SQLITE_IMPORT_PATH;

  if (!sourcePath) {
    throw new Error(
      "SQLITE_IMPORT_PATH is not set. Point it to a legacy SQLite export file before running this migration."
    );
  }

  const resolvedPath = path.resolve(process.cwd(), sourcePath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`SQLite source file was not found: ${resolvedPath}`);
  }

  return resolvedPath;
}

function loadSqliteExport() {
  const sqliteSourcePath = resolveSqliteSourcePath();
  const pythonScript = `
import sqlite3, json

conn = sqlite3.connect(${JSON.stringify(sqliteSourcePath)})
conn.row_factory = sqlite3.Row
cur = conn.cursor()

def rows(query):
    cur.execute(query)
    return [dict(row) for row in cur.fetchall()]

payload = {
  "promotions": rows('SELECT slug, name, shortName FROM "Promotion"'),
  "sources": rows('SELECT slug, label, type, url FROM "Source"'),
  "tags": rows('SELECT slug, label FROM "Tag"'),
  "events": rows("""
    SELECT e.slug, e.name, e.date, e.city, e.venue, e.status, e.summary, p.slug AS promotionSlug
    FROM "Event" e
    JOIN "Promotion" p ON p.id = e.promotionId
  """),
  "fights": rows("""
    SELECT
      f.id,
      e.slug AS eventSlug,
      fa.slug AS fighterASlug,
      fb.slug AS fighterBSlug,
      w.slug AS winnerSlug,
      f.stage,
      f.weightClass,
      f.status,
      f.method,
      f.resultRound,
      f.resultTime
    FROM "Fight" f
    JOIN "Event" e ON e.id = f.eventId
    JOIN "Fighter" fa ON fa.id = f.fighterAId
    JOIN "Fighter" fb ON fb.id = f.fighterBId
    LEFT JOIN "Fighter" w ON w.id = f.winnerFighterId
  """),
  "articles": rows("""
    SELECT
      a.id,
      a.slug,
      a.title,
      a.excerpt,
      a.meaning,
      a.category,
      a.status,
      a.aiConfidence,
      a.ingestionSourceSummary,
      a.ingestionNotes,
      a.publishedAt,
      p.slug AS promotionSlug,
      e.slug AS eventSlug
    FROM "Article" a
    LEFT JOIN "Promotion" p ON p.id = a.promotionId
    LEFT JOIN "Event" e ON e.id = a.eventId
  """),
  "articleSections": rows("""
    SELECT s.heading, s.body, s.sortOrder, a.slug AS articleSlug
    FROM "ArticleSection" s
    JOIN "Article" a ON a.id = s.articleId
  """),
  "articleTags": rows("""
    SELECT a.slug AS articleSlug, t.slug AS tagSlug
    FROM "ArticleTag" at
    JOIN "Article" a ON a.id = at.articleId
    JOIN "Tag" t ON t.id = at.tagId
  """),
  "articleFighters": rows("""
    SELECT a.slug AS articleSlug, f.slug AS fighterSlug
    FROM "ArticleFighter" af
    JOIN "Article" a ON a.id = af.articleId
    JOIN "Fighter" f ON f.id = af.fighterId
  """),
  "articleSources": rows("""
    SELECT a.slug AS articleSlug, s.slug AS sourceSlug
    FROM "ArticleSource" asrc
    JOIN "Article" a ON a.id = asrc.articleId
    JOIN "Source" s ON s.id = asrc.sourceId
  """),
  "ingestionRuns": rows("""
    SELECT
      id, sourceKind, mode, status, filePath, baseUrl, itemCount, createdCount,
      duplicateCount, failedCount, durationMs, message, startedAt, finishedAt,
      createdAt, updatedAt
    FROM "IngestionRun"
  """)
}

print(json.dumps(payload, ensure_ascii=False))
conn.close()
`;

  const result = spawnSync("python", ["-c", pythonScript], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    env: {
      ...process.env,
      PYTHONIOENCODING: "utf-8"
    }
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "Failed to export SQLite content");
  }

  return JSON.parse(result.stdout);
}

function byKey(items, key, value) {
  return items.filter((item) => item[key] === value);
}

async function main() {
  const data = loadSqliteExport();

  for (const promotion of data.promotions) {
    await prisma.promotion.upsert({
      where: { slug: promotion.slug },
      create: promotion,
      update: {
        name: promotion.name,
        shortName: promotion.shortName
      }
    });
  }

  for (const source of data.sources) {
    await prisma.source.upsert({
      where: { slug: source.slug },
      create: source,
      update: {
        label: source.label,
        type: source.type,
        url: source.url
      }
    });
  }

  for (const tag of data.tags) {
    await prisma.tag.upsert({
      where: { slug: tag.slug },
      create: tag,
      update: {
        label: tag.label
      }
    });
  }

  for (const event of data.events) {
    const promotion = await prisma.promotion.findUnique({
      where: { slug: event.promotionSlug }
    });

    if (!promotion) {
      continue;
    }

    await prisma.event.upsert({
      where: { slug: event.slug },
      create: {
        slug: event.slug,
        name: event.name,
        date: new Date(event.date),
        city: event.city,
        venue: event.venue,
        status: event.status,
        summary: event.summary,
        promotionId: promotion.id
      },
      update: {
        name: event.name,
        date: new Date(event.date),
        city: event.city,
        venue: event.venue,
        status: event.status,
        summary: event.summary,
        promotionId: promotion.id
      }
    });
  }

  for (const event of data.events) {
    const targetEvent = await prisma.event.findUnique({
      where: { slug: event.slug }
    });

    if (!targetEvent) {
      continue;
    }

    const fights = byKey(data.fights, "eventSlug", event.slug);

    await prisma.fight.deleteMany({
      where: { eventId: targetEvent.id }
    });

    for (const fight of fights) {
      const fighterA = await prisma.fighter.findUnique({ where: { slug: fight.fighterASlug } });
      const fighterB = await prisma.fighter.findUnique({ where: { slug: fight.fighterBSlug } });
      const winner = fight.winnerSlug
        ? await prisma.fighter.findUnique({ where: { slug: fight.winnerSlug } })
        : null;

      if (!fighterA || !fighterB) {
        continue;
      }

      const fightSlug = `${fighterA.slug}-vs-${fighterB.slug}`;
      await prisma.fight.create({
        data: {
          slug: fightSlug,
          stage: fight.stage,
          weightClass: fight.weightClass,
          status: fight.status,
          method: fight.method,
          resultRound: fight.resultRound,
          resultTime: fight.resultTime,
          eventId: targetEvent.id,
          fighterAId: fighterA.id,
          fighterBId: fighterB.id,
          winnerFighterId: winner?.id || null
        }
      });
    }
  }

  for (const article of data.articles) {
    const promotion = article.promotionSlug
      ? await prisma.promotion.findUnique({ where: { slug: article.promotionSlug } })
      : null;
    const event = article.eventSlug
      ? await prisma.event.findUnique({ where: { slug: article.eventSlug } })
      : null;

    await prisma.article.upsert({
      where: { slug: article.slug },
      create: {
        slug: article.slug,
        title: article.title,
        excerpt: article.excerpt,
        meaning: article.meaning,
        category: article.category,
        status: article.status,
        aiConfidence: article.aiConfidence,
        ingestionSourceSummary: article.ingestionSourceSummary,
        ingestionNotes: article.ingestionNotes,
        publishedAt: new Date(article.publishedAt),
        promotionId: promotion?.id || null,
        eventId: event?.id || null
      },
      update: {
        title: article.title,
        excerpt: article.excerpt,
        meaning: article.meaning,
        category: article.category,
        status: article.status,
        aiConfidence: article.aiConfidence,
        ingestionSourceSummary: article.ingestionSourceSummary,
        ingestionNotes: article.ingestionNotes,
        publishedAt: new Date(article.publishedAt),
        promotionId: promotion?.id || null,
        eventId: event?.id || null
      }
    });

    const targetArticle = await prisma.article.findUnique({
      where: { slug: article.slug }
    });

    if (!targetArticle) {
      continue;
    }

    const sections = byKey(data.articleSections, "articleSlug", article.slug)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((section) => ({
        heading: section.heading,
        body: section.body,
        sortOrder: section.sortOrder,
        articleId: targetArticle.id
      }));

    await prisma.articleSection.deleteMany({
      where: { articleId: targetArticle.id }
    });

    if (sections.length) {
      await prisma.articleSection.createMany({
        data: sections
      });
    }

    await prisma.articleTag.deleteMany({
      where: { articleId: targetArticle.id }
    });

    for (const link of byKey(data.articleTags, "articleSlug", article.slug)) {
      const tag = await prisma.tag.findUnique({ where: { slug: link.tagSlug } });

      if (!tag) {
        continue;
      }

      await prisma.articleTag.create({
        data: {
          articleId: targetArticle.id,
          tagId: tag.id
        }
      });
    }

    await prisma.articleSource.deleteMany({
      where: { articleId: targetArticle.id }
    });

    for (const link of byKey(data.articleSources, "articleSlug", article.slug)) {
      const source = await prisma.source.findUnique({ where: { slug: link.sourceSlug } });

      if (!source) {
        continue;
      }

      await prisma.articleSource.create({
        data: {
          articleId: targetArticle.id,
          sourceId: source.id
        }
      });
    }

    await prisma.articleFighter.deleteMany({
      where: { articleId: targetArticle.id }
    });

    for (const link of byKey(data.articleFighters, "articleSlug", article.slug)) {
      const fighter = await prisma.fighter.findUnique({ where: { slug: link.fighterSlug } });

      if (!fighter) {
        continue;
      }

      await prisma.articleFighter.create({
        data: {
          articleId: targetArticle.id,
          fighterId: fighter.id
        }
      });
    }
  }

  for (const run of data.ingestionRuns) {
    await prisma.ingestionRun.upsert({
      where: { id: run.id },
      create: {
        id: run.id,
        sourceKind: run.sourceKind,
        mode: run.mode,
        status: run.status,
        filePath: run.filePath,
        baseUrl: run.baseUrl,
        itemCount: run.itemCount,
        createdCount: run.createdCount,
        duplicateCount: run.duplicateCount,
        failedCount: run.failedCount,
        durationMs: run.durationMs,
        message: run.message,
        startedAt: run.startedAt ? new Date(run.startedAt) : new Date(),
        finishedAt: run.finishedAt ? new Date(run.finishedAt) : null,
        createdAt: run.createdAt ? new Date(run.createdAt) : new Date(),
        updatedAt: run.updatedAt ? new Date(run.updatedAt) : new Date()
      },
      update: {
        sourceKind: run.sourceKind,
        mode: run.mode,
        status: run.status,
        filePath: run.filePath,
        baseUrl: run.baseUrl,
        itemCount: run.itemCount,
        createdCount: run.createdCount,
        duplicateCount: run.duplicateCount,
        failedCount: run.failedCount,
        durationMs: run.durationMs,
        message: run.message,
        startedAt: run.startedAt ? new Date(run.startedAt) : undefined,
        finishedAt: run.finishedAt ? new Date(run.finishedAt) : null
      }
    });
  }

  const summary = {
    promotions: await prisma.promotion.count(),
    sources: await prisma.source.count(),
    tags: await prisma.tag.count(),
    events: await prisma.event.count(),
    fights: await prisma.fight.count(),
    articles: await prisma.article.count(),
    articleSections: await prisma.articleSection.count(),
    articleTags: await prisma.articleTag.count(),
    articleSources: await prisma.articleSource.count(),
    articleFighters: await prisma.articleFighter.count(),
    ingestionRuns: await prisma.ingestionRun.count()
  };

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
