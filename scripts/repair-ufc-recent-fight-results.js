#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function detectResult(note) {
  const value = String(note || "").trim();
  if (!value) return null;

  if (
    /\b(won|submitted|stopped|scored|knocked out)\b/i.test(value) &&
    !/\bwas submitted\b/i.test(value) &&
    !/\bwas stopped\b/i.test(value) &&
    !/\bwas knocked out\b/i.test(value) &&
    !/\bwas defeated\b/i.test(value)
  ) {
    return "Победа";
  }

  if (/\b(lost|was defeated|was submitted|was stopped|was knocked out)\b/i.test(value)) {
    return "Поражение";
  }

  if (/\bno contest\b/i.test(value)) {
    return "Несостоявшийся бой";
  }

  return null;
}

async function main() {
  const fights = await prisma.fighterRecentFight.findMany({
    where: {
      fighter: {
        promotion: {
          slug: "ufc"
        }
      },
      notes: {
        not: null
      }
    },
    select: {
      id: true,
      result: true,
      notes: true,
      opponentName: true,
      fighter: {
        select: {
          slug: true,
          name: true
        }
      }
    }
  });

  let checked = 0;
  let updated = 0;
  const samples = [];

  for (const fight of fights) {
    checked += 1;
    const detected = detectResult(fight.notes);
    if (!detected || detected === fight.result) {
      continue;
    }

    await prisma.fighterRecentFight.update({
      where: { id: fight.id },
      data: { result: detected }
    });

    updated += 1;
    if (samples.length < 50) {
      samples.push({
        fighterSlug: fight.fighter.slug,
        fighterName: fight.fighter.name,
        opponentName: fight.opponentName,
        previousResult: fight.result,
        nextResult: detected
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        checked,
        updated,
        samples
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
