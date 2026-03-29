#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");

const { buildGenericBio, hasMeaningfulRecord, normalizeCountry, transliterateName } = require("./fighter-import-utils");

const prisma = new PrismaClient();

const englishCountryHints = [
  "ecuador",
  "united states",
  "brazil",
  "england",
  "france",
  "philippines",
  "jamaica",
  "sweden",
  "russia",
  "ukraine",
  "unknown"
];

function sanitizeBio(text) {
  return String(text || "")
    .replace(/,\s*[^,.!?;]*Unknown\s+\u0438\s+/gi, ", ")
    .replace(/\bUnknown\b/gi, "")
    .replace(/\s+,/g, ",")
    .replace(/\s+\./g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function needsBioRefresh(bio) {
  const text = sanitizeBio(bio);
  const lower = text.toLowerCase();

  if (!text) {
    return true;
  }

  if (text.includes("0-0")) {
    return true;
  }

  if (lower.includes("официальное описание профиля")) {
    return true;
  }

  if (lower.includes("профиль бойца указывает на активную карьеру")) {
    return true;
  }

  if (lower.includes("представляющий unknown")) {
    return true;
  }

  if (englishCountryHints.some((hint) => lower.includes(hint))) {
    return true;
  }

  return text.length < 120;
}

async function main() {
  const fighters = await prisma.fighter.findMany({
    include: {
      promotion: true
    }
  });

  let updated = 0;

  for (const fighter of fighters) {
    const nextCountry = normalizeCountry(fighter.country);
    const nextRecord = hasMeaningfulRecord(fighter.record) ? fighter.record : "";
    const nextNameRu = fighter.nameRu || transliterateName(fighter.name);
    const rawBio = needsBioRefresh(fighter.bio)
      ? buildGenericBio({
          nameRu: nextNameRu,
          promotionSlug: fighter.promotion.slug,
          country: nextCountry,
          weightClass: fighter.weightClass,
          status: fighter.status,
          nickname: fighter.nickname,
          record: nextRecord,
          team: fighter.team,
          highlights: null,
          description: fighter.bio
        })
      : fighter.bio;
    const nextBio = sanitizeBio(rawBio);

    if (nextCountry !== fighter.country || nextRecord !== fighter.record || nextNameRu !== fighter.nameRu || nextBio !== fighter.bio) {
      await prisma.fighter.update({
        where: { id: fighter.id },
        data: {
          country: nextCountry,
          record: nextRecord,
          nameRu: nextNameRu,
          bio: nextBio
        }
      });
      updated += 1;
    }
  }

  console.log(`Normalized ${updated} fighter profiles.`);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
