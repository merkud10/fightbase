const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const events = await prisma.event.findMany({
    include: { promotion: true, fights: { include: { fighterA: true, fighterB: true } } },
    orderBy: { date: "asc" },
    take: 6
  });

  for (const e of events) {
    console.log(`\n${e.name} | ${e.date.toISOString().slice(0, 10)} | ${e.promotion.slug} | ${e.fights.length} fights`);
    for (const f of e.fights.slice(0, 5)) {
      console.log(`  ${f.stage}: ${f.fighterA.name} vs ${f.fighterB.name} | ${f.weightClass}`);
    }
    if (e.fights.length > 5) console.log(`  ...and ${e.fights.length - 5} more`);
  }

  const totalEvents = await prisma.event.count();
  const totalFights = await prisma.fight.count();
  const analysisArticles = await prisma.article.count({ where: { category: "analysis" } });
  console.log(`\nTotal: ${totalEvents} events, ${totalFights} fights, ${analysisArticles} predictions`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
