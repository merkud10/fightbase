#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function cleanOpponentName(value) {
  return String(value || "")
    .replace(/^\s*by\s+/i, "")
    .trim();
}

function cleanMethod(value) {
  return String(value || "")
    .replace(/^via\s+/i, "")
    .trim();
}

function detectResultFromNotes(value) {
  const note = String(value || "").trim();
  if (!note) {
    return null;
  }

  if (/\b(won|submitted|stopped)\b/i.test(note) && !/\bwas submitted\b/i.test(note) && !/\bwas stopped\b/i.test(note)) {
    return "\u041f\u043e\u0431\u0435\u0434\u0430";
  }

  if (/\b(lost|was submitted|was stopped)\b/i.test(note)) {
    return "\u041f\u043e\u0440\u0430\u0436\u0435\u043d\u0438\u0435";
  }

  if (/\bno contest\b/i.test(note)) {
    return "\u041d\u0435\u0441\u043e\u0441\u0442\u043e\u044f\u0432\u0448\u0438\u0439\u0441\u044f \u0431\u043e\u0439";
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
      }
    },
    include: {
      fighter: {
        select: {
          name: true
        }
      }
    }
  });

  let updated = 0;

  for (const fight of fights) {
    const nextOpponentName = cleanOpponentName(fight.opponentName);
    const nextMethod = cleanMethod(fight.method);
    const nextNotes = typeof fight.notes === "string" ? fight.notes.replace(/\s+/g, " ").trim() : fight.notes;
    const nextResult = detectResultFromNotes(nextNotes) || fight.result;

    if (
      nextOpponentName !== fight.opponentName ||
      nextMethod !== (fight.method || "") ||
      nextNotes !== fight.notes ||
      nextResult !== fight.result
    ) {
      await prisma.fighterRecentFight.update({
        where: { id: fight.id },
        data: {
          opponentName: nextOpponentName,
          method: nextMethod || null,
          notes: nextNotes || null,
          result: nextResult
        }
      });
      updated += 1;
    }
  }

  console.log(JSON.stringify({ checked: fights.length, updated }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
