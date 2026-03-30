#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");

const { transliterateName } = require("./fighter-import-utils");

const prisma = new PrismaClient();

async function main() {
  const fighters = await prisma.fighter.findMany({
    where: {
      promotion: {
        slug: {
          in: ["pfl", "one"]
        }
      }
    },
    select: {
      id: true,
      slug: true,
      name: true,
      nameRu: true,
      promotion: {
        select: {
          slug: true
        }
      }
    },
    orderBy: [{ promotion: { slug: "asc" } }, { name: "asc" }]
  });

  let updated = 0;

  for (const fighter of fighters) {
    const nextNameRu = transliterateName(fighter.name);

    if (!nextNameRu || nextNameRu === fighter.nameRu) {
      continue;
    }

    await prisma.fighter.update({
      where: { id: fighter.id },
      data: { nameRu: nextNameRu }
    });

    updated += 1;
    console.log(`[${fighter.promotion.slug}] ${fighter.name} -> ${nextNameRu}`);
  }

  console.log(
    JSON.stringify(
      {
        scanned: fighters.length,
        updated
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
