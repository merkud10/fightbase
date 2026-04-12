#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const events = await prisma.event.findMany({
    where: { status: "upcoming" },
    select: { id: true, slug: true, _count: { select: { fights: true } } }
  });

  if (events.length === 0) {
    console.log("No upcoming events found.");
    return;
  }

  console.log(`Found ${events.length} upcoming event(s):\n`);
  for (const e of events) {
    console.log(`  ${e.slug} — ${e._count.fights} fight(s)`);
  }

  const eventIds = events.map((e) => e.id);

  const deletedSnapshots = await prisma.fightPredictionSnapshot.deleteMany({
    where: { eventId: { in: eventIds } }
  });
  console.log(`\nDeleted ${deletedSnapshots.count} prediction snapshot(s)`);

  const deletedFights = await prisma.fight.deleteMany({
    where: { eventId: { in: eventIds } }
  });
  console.log(`Deleted ${deletedFights.count} fight(s)`);

  console.log("\nDone. Now run: npm run content:sync-event-fights");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
