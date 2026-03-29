#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const ARTICLE_LIKE_PATTERN =
  /i-am-still-here|wants-this|journey-continues|ufc-|vegas|edmonton|mexico-city|student-of-the-game|calm-cool-and-collected|losing-is-not-an-option/i;

function isArticleLike(value) {
  return ARTICLE_LIKE_PATTERN.test(String(value || ""));
}

async function main() {
  const fighters = await prisma.fighter.findMany({
    where: {
      promotion: { slug: "ufc" },
      status: { in: ["active", "champion", "prospect"] }
    },
    select: {
      id: true,
      slug: true,
      name: true,
      articleMap: { select: { articleId: true } },
      recentFights: { select: { id: true } },
      fightsA: { select: { id: true } },
      fightsB: { select: { id: true } }
    }
  });

  const targets = fighters.filter(
    (fighter) => isArticleLike(fighter.slug) || isArticleLike(fighter.name)
  );

  let deleted = 0;
  let skipped = 0;

  for (const fighter of targets) {
    const hasScheduledFightLinks = fighter.fightsA.length > 0 || fighter.fightsB.length > 0;

    if (hasScheduledFightLinks) {
      skipped += 1;
      console.log(`Skipped linked UFC pseudo-profile: ${fighter.slug}`);
      continue;
    }

    await prisma.fighter.delete({
      where: { id: fighter.id }
    });

    deleted += 1;
    console.log(`Deleted UFC pseudo-profile: ${fighter.slug}`);
  }

  console.log(
    JSON.stringify(
      {
        found: targets.length,
        deleted,
        skipped
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
