#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");

const { transliterateName } = require("./fighter-import-utils");

const prisma = new PrismaClient();

const suspiciousPatterns = [/сч/i, /таилор/i, /кларке/i];

async function main() {
  const fighters = await prisma.fighter.findMany({
    where: {
      promotion: {
        slug: "ufc"
      }
    },
    select: {
      id: true,
      slug: true,
      name: true,
      nameRu: true
    },
    orderBy: { name: "asc" }
  });

  let updated = 0;

  for (const fighter of fighters) {
    const currentNameRu = String(fighter.nameRu || "");

    if (!suspiciousPatterns.some((pattern) => pattern.test(currentNameRu))) {
      continue;
    }

    const nextNameRu = transliterateName(fighter.name);

    if (!nextNameRu || nextNameRu === currentNameRu) {
      continue;
    }

    await prisma.fighter.update({
      where: { id: fighter.id },
      data: { nameRu: nextNameRu }
    });

    updated += 1;
    console.log(`${fighter.name} -> ${nextNameRu}`);
  }

  console.log(JSON.stringify({ scanned: fighters.length, updated }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
