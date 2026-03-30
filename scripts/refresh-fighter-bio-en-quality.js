#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");
const { buildGenericBioEn, stripTags } = require("./fighter-import-utils");

const prisma = new PrismaClient();

function needsRewrite(bioEn) {
  const value = stripTags(bioEn || "");
  if (!value) {
    return true;
  }

  return (
    /Get the latest UFC/i.test(value) ||
    /Official profile details list/i.test(value) ||
    /lists a (?:8|11|18)\b/i.test(value) ||
    /Represents [А-Яа-яЁё]/.test(value) ||
    /Known by the nickname/i.test(value) && /Official profile details list/i.test(value)
  );
}

async function main() {
  const fighters = await prisma.fighter.findMany({
    include: {
      promotion: true
    }
  });

  let updated = 0;

  for (const fighter of fighters) {
    if (!needsRewrite(fighter.bioEn)) {
      continue;
    }

    const rewritten = buildGenericBioEn({
      name: fighter.name,
      promotionSlug: fighter.promotion?.slug || "mma",
      country: fighter.country,
      weightClass: fighter.weightClass,
      status: fighter.status,
      nickname: fighter.nickname,
      record: fighter.record,
      team: fighter.team,
      highlights: null,
      description: null
    });

    await prisma.fighter.update({
      where: { id: fighter.id },
      data: {
        bioEn: rewritten
      }
    });
    updated += 1;
  }

  console.log(`Refreshed English fighter bio quality: ${updated}`);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
