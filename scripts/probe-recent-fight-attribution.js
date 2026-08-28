#!/usr/bin/env node

// Разведка двух дефектов в FighterRecentFight, которые аудит качества не ловит:
//   1. notes описывают бой постороннего бойца (в профиле Йотко лежит
//      «Malott was stopped by Neil Magny»);
//   2. в поле имени соперника осел кусок английской фразы
//      («Darion Abbey ... win by strikes» → «Дарион Аббеи Уит Стрикес»).
// Только читает.

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function words(value) {
  return normalize(value)
    .replace(/[^a-zа-яё]+/gi, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

// Английские служебные слова боевого протокола, попавшие в поле имени.
const EN_NOISE = /\b(strikes?|win|won|loss|lost|via|decision|submission|round|knockout|tko|ko)\b/i;
// Их транслитерированные следы в русском поле.
const RU_NOISE = /\b(уит|виа|стрикес|страйкс|уин|бай|дэсижн|десижн|викт|дефит|сабмишн)\b/i;

async function main() {
  const rows = await prisma.fighterRecentFight.findMany({
    select: {
      opponentName: true,
      opponentNameRu: true,
      notes: true,
      fighter: { select: { slug: true, name: true } }
    }
  });

  const orphanNotes = [];
  const garbled = [];

  for (const row of rows) {
    const enNoise = EN_NOISE.test(String(row.opponentName || ""));
    const ruNoise = RU_NOISE.test(String(row.opponentNameRu || ""));
    if (enNoise || ruNoise) {
      garbled.push({
        fighter: row.fighter.slug,
        opponentName: row.opponentName,
        opponentNameRu: row.opponentNameRu,
        reason: enNoise ? "мусор в англ. имени" : "мусор в рус. имени"
      });
    }

    if (!row.notes) {
      continue;
    }

    // notes всегда начинаются с имени того, чей это бой. Если ни одно слово
    // из имени владельца профиля в заметке не встречается — заметка чужая.
    const noteWords = new Set(words(row.notes));
    const ownerHit = words(row.fighter.name).some((token) => noteWords.has(token));

    if (!ownerHit) {
      orphanNotes.push({
        fighter: row.fighter.slug,
        fighterName: row.fighter.name,
        opponentName: row.opponentName,
        notes: row.notes.slice(0, 110)
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        totalRows: rows.length,
        notesFromAnotherFighter: orphanNotes.length,
        garbledOpponentNames: garbled.length,
        orphanSamples: orphanNotes.slice(0, 12),
        garbledSamples: garbled.slice(0, 12)
      },
      null,
      1
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
