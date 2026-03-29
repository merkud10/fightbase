#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function transliterateLatin(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/ø/g, "o")
    .replace(/đ/g, "d")
    .replace(/ł/g, "l")
    .replace(/æ/g, "ae")
    .replace(/œ/g, "oe");
}

function normalize(value) {
  return transliterateLatin(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(value) {
  return normalize(value).split(/\s+/).filter(Boolean);
}

function detectResult(note) {
  const value = String(note || "").trim();
  if (!value) return null;
  if (/\b(won|submitted|stopped)\b/i.test(value) && !/\bwas submitted\b/i.test(value) && !/\bwas stopped\b/i.test(value)) {
    return "Победа";
  }
  if (/\b(lost|was submitted|was stopped)\b/i.test(value)) {
    return "Поражение";
  }
  if (/\bno contest\b/i.test(value)) {
    return "Несостоявшийся бой";
  }
  return null;
}

async function main() {
  const [fighters, fights] = await Promise.all([
    prisma.fighter.findMany({
      where: {
        promotion: { slug: "ufc" },
        status: { in: ["active", "champion", "prospect"] }
      },
      select: { id: true, slug: true, name: true, nameRu: true, photoUrl: true, status: true }
    }),
    prisma.fighterRecentFight.findMany({
      where: { fighter: { promotion: { slug: "ufc" } }, notes: { not: null } },
      select: { id: true, result: true, notes: true, opponentName: true, fighter: { select: { slug: true, name: true } } }
    })
  ]);

  const suspiciousSlugs = fighters.filter((fighter) => {
    const decodedSlug = decodeURIComponent(String(fighter.slug || ""));
    const slugTokens = tokens(decodedSlug.replace(/-\d+$/g, "").replace(/-/g, " "));
    const nameTokens = tokens(fighter.name);
    const overlap = slugTokens.filter((token) => nameTokens.includes(token)).length;
    const articleLike = /i-am-still-here|wants-this|journey-continues|ufc-|vegas|edmonton|mexico-city|student-of-the-game|calm-cool-and-collected|losing-is-not-an-option/i.test(
      fighter.slug
    );
    return articleLike || (slugTokens.length > 1 && nameTokens.length > 1 && overlap === 0);
  });

  const resultMismatches = fights.filter((fight) => {
    const detected = detectResult(fight.notes);
    return detected && detected !== fight.result;
  });

  console.log(
    JSON.stringify(
      {
        suspiciousSlugCount: suspiciousSlugs.length,
        resultMismatchCount: resultMismatches.length,
        suspiciousSlugs: suspiciousSlugs.slice(0, 100),
        resultMismatches: resultMismatches.slice(0, 100)
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
