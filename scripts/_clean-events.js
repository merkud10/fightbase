#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const analysisArticles = await prisma.article.findMany({
    where: { category: "analysis" },
    select: { id: true }
  });
  const articleIds = analysisArticles.map((a) => a.id);

  if (articleIds.length > 0) {
    await prisma.articleFighter.deleteMany({ where: { articleId: { in: articleIds } } });
    await prisma.articleTag.deleteMany({ where: { articleId: { in: articleIds } } });
    await prisma.articleSection.deleteMany({ where: { articleId: { in: articleIds } } });
    await prisma.articleSource.deleteMany({ where: { articleId: { in: articleIds } } });
    await prisma.article.deleteMany({ where: { id: { in: articleIds } } });
    console.log(`Deleted ${articleIds.length} analysis articles + relations`);
  } else {
    console.log("No analysis articles found");
  }

  const fights = await prisma.fight.deleteMany();
  console.log(`Deleted ${fights.count} fights`);

  const events = await prisma.event.deleteMany();
  console.log(`Deleted ${events.count} events`);

  console.log("Done. Database cleaned for events/fights/predictions.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
