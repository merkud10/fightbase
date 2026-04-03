#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");

const { transliterateName } = require("./fighter-import-utils");

const prisma = new PrismaClient();

const suspiciousPatterns = [
  /сч/i,
  /кларке/i,
  /таилор/i,
  /дже и/i
];

async function main() {
  const fighters = await prisma.fighter.findMany({
    where: {
      promotion: {
        slug: {
          in: ["ufc"]
        }
      }
    },
    select: {
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

  const suspicious = fighters
    .map((fighter) => {
      const generated = transliterateName(fighter.name);
      const reasons = [];

      if (!fighter.nameRu) {
        reasons.push("missing_name_ru");
      }

      for (const pattern of suspiciousPatterns) {
        if (pattern.test(String(fighter.nameRu || ""))) {
          reasons.push(`pattern:${pattern}`);
        }
      }

      if (fighter.promotion.slug !== "ufc" && fighter.nameRu && fighter.nameRu !== generated) {
        reasons.push("manual_override");
      }

      if (!reasons.length) {
        return null;
      }

      return {
        promotion: fighter.promotion.slug,
        slug: fighter.slug,
        name: fighter.name,
        nameRu: fighter.nameRu,
        generated,
        reasons
      };
    })
    .filter(Boolean);

  const summary = suspicious.reduce((acc, item) => {
    acc[item.promotion] = (acc[item.promotion] || 0) + 1;
    return acc;
  }, {});

  console.log(
    JSON.stringify(
      {
        totalScanned: fighters.length,
        suspiciousCount: suspicious.length,
        summary,
        sample: suspicious.slice(0, 50)
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
