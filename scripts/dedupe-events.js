#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const events = await prisma.event.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      fights: { select: { id: true } },
      articles: { select: { id: true } },
      predictionSnapshots: { select: { id: true } }
    }
  });

  const dateGroups = new Map();
  for (const event of events) {
    const dayKey = `${event.promotionId}_${event.date.toISOString().slice(0, 10)}`;
    if (!dateGroups.has(dayKey)) {
      dateGroups.set(dayKey, []);
    }
    dateGroups.get(dayKey).push(event);
  }

  let deleted = 0;

  for (const [dayKey, group] of dateGroups) {
    if (group.length <= 1) {
      continue;
    }

    group.sort((a, b) => {
      const aRels = a.fights.length + a.articles.length + a.predictionSnapshots.length;
      const bRels = b.fights.length + b.articles.length + b.predictionSnapshots.length;
      if (aRels !== bRels) return bRels - aRels;
      return a.createdAt - b.createdAt;
    });

    const keep = group[0];
    const duplicates = group.slice(1);

    console.log(`\n${dayKey}: keeping "${keep.name}" (slug: ${keep.slug}, relations: ${keep.fights.length}F ${keep.articles.length}A)`);

    for (const dup of duplicates) {
      const dupRels = dup.fights.length + dup.articles.length + dup.predictionSnapshots.length;

      if (dupRels > 0) {
        console.log(`  [migrate] "${dup.name}" (slug: ${dup.slug}) has ${dupRels} relations — reassigning`);
        await prisma.fight.updateMany({ where: { eventId: dup.id }, data: { eventId: keep.id } });
        await prisma.article.updateMany({ where: { eventId: dup.id }, data: { eventId: keep.id } });
        await prisma.fightPredictionSnapshot.updateMany({ where: { eventId: dup.id }, data: { eventId: keep.id } });
      }

      await prisma.event.delete({ where: { id: dup.id } });
      deleted += 1;
      console.log(`  [deleted] "${dup.name}" (slug: ${dup.slug})`);
    }
  }

  console.log(`\nDone. Deleted ${deleted} duplicate event(s).`);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
