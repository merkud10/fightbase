#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function canonicalScore(fighter) {
  let score = 0;

  if (fighter.slug === fighter.baseSlug) {
    score += 100;
  }

  if (!/-\d+$/.test(fighter.slug)) {
    score += 20;
  }

  score += fighter.recentFightCount;
  score += fighter.fightCount * 10;
  score += fighter.articleCount * 5;

  return score;
}

async function moveArticleLinks(fromId, toId) {
  const links = await prisma.articleFighter.findMany({
    where: { fighterId: fromId },
    select: { articleId: true }
  });

  for (const link of links) {
    await prisma.articleFighter.upsert({
      where: {
        articleId_fighterId: {
          articleId: link.articleId,
          fighterId: toId
        }
      },
      update: {},
      create: {
        articleId: link.articleId,
        fighterId: toId
      }
    });
  }

  await prisma.articleFighter.deleteMany({ where: { fighterId: fromId } });
}

async function moveRecentFights(fromId, toId) {
  await prisma.fighterRecentFight.updateMany({
    where: { fighterId: fromId },
    data: { fighterId: toId }
  });
}

async function moveFightReferences(fromId, toId) {
  await prisma.fight.updateMany({
    where: { fighterAId: fromId },
    data: { fighterAId: toId }
  });

  await prisma.fight.updateMany({
    where: { fighterBId: fromId },
    data: { fighterBId: toId }
  });
}

async function buildCandidateGroups() {
  const duplicates = await prisma.fighter.groupBy({
    by: ["name"],
    where: { promotion: { slug: "ufc" } },
    _count: { name: true },
    having: {
      name: {
        _count: {
          gt: 1
        }
      }
    }
  });

  const groups = [];

  for (const row of duplicates) {
    const fighters = await prisma.fighter.findMany({
      where: {
        promotion: { slug: "ufc" },
        name: row.name
      },
      select: {
        id: true,
        slug: true,
        name: true,
        createdAt: true
      },
      orderBy: [{ slug: "asc" }, { createdAt: "asc" }]
    });

    const enriched = [];

    for (const fighter of fighters) {
      const [recentFightCount, fightsA, fightsB, articleCount] = await Promise.all([
        prisma.fighterRecentFight.count({ where: { fighterId: fighter.id } }),
        prisma.fight.count({ where: { fighterAId: fighter.id } }),
        prisma.fight.count({ where: { fighterBId: fighter.id } }),
        prisma.articleFighter.count({ where: { fighterId: fighter.id } })
      ]);

      enriched.push({
        ...fighter,
        baseSlug: fighter.slug.replace(/-\d+$/, ""),
        recentFightCount,
        fightCount: fightsA + fightsB,
        articleCount
      });
    }

    groups.push(enriched);
  }

  return groups;
}

async function main() {
  const groups = await buildCandidateGroups();
  let mergedGroups = 0;
  let deletedFighters = 0;

  for (const group of groups) {
    const normalizedNames = new Set(group.map((fighter) => normalizeName(fighter.name)));
    if (normalizedNames.size !== 1) {
      continue;
    }

    const sorted = [...group].sort((left, right) => {
      const scoreDiff = canonicalScore(right) - canonicalScore(left);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      if (left.slug < right.slug) {
        return -1;
      }
      if (left.slug > right.slug) {
        return 1;
      }
      return 0;
    });

    const canonical = sorted[0];
    const duplicates = sorted.slice(1);

    for (const duplicate of duplicates) {
      await moveArticleLinks(duplicate.id, canonical.id);
      await moveRecentFights(duplicate.id, canonical.id);
      await moveFightReferences(duplicate.id, canonical.id);
      await prisma.fighter.delete({ where: { id: duplicate.id } });
      deletedFighters += 1;
    }

    if (duplicates.length) {
      mergedGroups += 1;
    }
  }

  console.log(JSON.stringify({ groupsChecked: groups.length, mergedGroups, deletedFighters }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
