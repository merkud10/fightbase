#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");
const { buildGenericBioEn, stripTags } = require("./fighter-import-utils");

const prisma = new PrismaClient();

function hasCyrillic(value) {
  return /[А-Яа-яЁё]/.test(String(value || ""));
}

async function main() {
  const fighters = await prisma.fighter.findMany({
    where: {
      OR: [{ bioEn: null }, { bioEn: "" }]
    },
    include: {
      promotion: true
    }
  });

  let updated = 0;

  for (const fighter of fighters) {
    const sourceBio = stripTags(fighter.bio || "");
    const generated =
      sourceBio && !hasCyrillic(sourceBio) && sourceBio.length > 120
        ? sourceBio
        : buildGenericBioEn({
            name: fighter.name,
            promotionSlug: fighter.promotion?.slug || "mma",
            country: fighter.country,
            weightClass: fighter.weightClass,
            status: fighter.status,
            nickname: fighter.nickname,
            record: fighter.record,
            team: fighter.team,
            highlights: null,
            description: sourceBio && !hasCyrillic(sourceBio) ? sourceBio : null
          });

    await prisma.fighter.update({
      where: { id: fighter.id },
      data: {
        bioEn: generated
      }
    });
    updated += 1;
  }

  console.log(`Filled missing English fighter bios: ${updated}`);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
