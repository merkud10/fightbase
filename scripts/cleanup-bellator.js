#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function rewriteBellatorBio(value) {
  return String(value || "")
    .replace(/PFL\/Bellator/gi, "PFL")
    .replace(/Bellator/gi, "PFL")
    .replace(/в системе PFL/gi, "в ростере PFL");
}

async function main() {
  const [bellator, pfl] = await Promise.all([
    prisma.promotion.findUnique({ where: { slug: "bellator" } }),
    prisma.promotion.findUnique({ where: { slug: "pfl" } })
  ]);

  if (!pfl) {
    throw new Error("PFL promotion not found");
  }

  if (!bellator) {
    console.log(JSON.stringify({ deletedArticles: 0, migratedFighters: 0, deletedPromotion: false }, null, 2));
    return;
  }

  const bellatorFighters = await prisma.fighter.findMany({
    where: { promotionId: bellator.id },
    select: { id: true, bio: true }
  });

  for (const fighter of bellatorFighters) {
    await prisma.fighter.update({
      where: { id: fighter.id },
      data: {
        promotionId: pfl.id,
        bio: rewriteBellatorBio(fighter.bio)
      }
    });
  }

  const deletedArticles = await prisma.article.deleteMany({
    where: { promotionId: bellator.id }
  });

  await prisma.promotion.delete({
    where: { id: bellator.id }
  });

  console.log(
    JSON.stringify(
      {
        deletedArticles: deletedArticles.count,
        migratedFighters: bellatorFighters.length,
        deletedPromotion: true
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
