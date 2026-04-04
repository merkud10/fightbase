#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");
const { fetchText, stripTags } = require("./fighter-import-utils");

const prisma = new PrismaClient();

function parseOfficialChampionRows(html) {
  const matches = [
    ...html.matchAll(
      /<div class="view-grouping-header">([\s\S]*?)<\/div>[\s\S]*?<div class="rankings--athlete--champion clearfix">[\s\S]*?<h5><a href="\/athlete\/([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h5>/gi
    )
  ];

  return matches.map((match) => ({
    division: stripTags(match[1]).replace(/&#039;/g, "'").trim(),
    slug: String(match[2] || "").trim(),
    name: stripTags(match[3]).trim()
  }));
}

function isPoundForPoundDivision(name) {
  return /pound-for-pound/i.test(String(name || ""));
}

function parseStatusTag(html, fallbackStatus) {
  const tags = [...html.matchAll(/<p class="hero-profile__tag">\s*([\s\S]*?)\s*<\/p>/gi)]
    .map((match) => stripTags(match[1]).replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const tagText = tags.join(" | ");

  if (/champion|title holder|interim/i.test(tagText)) {
    return "champion";
  }

  if (/retired|hall of fame|not fighting/i.test(tagText)) {
    return "retired";
  }

  if (/prospect|contender series|road to ufc/i.test(tagText)) {
    return "prospect";
  }

  if (/active/i.test(tagText)) {
    return "active";
  }

  return fallbackStatus === "prospect" ? "prospect" : "active";
}

async function main() {
  const rankingsHtml = await fetchText("https://www.ufc.com/rankings");
  const championRows = parseOfficialChampionRows(rankingsHtml).filter((row) => !isPoundForPoundDivision(row.division));
  const officialChampionSlugs = new Set(championRows.map((row) => row.slug));

  const promotion = await prisma.promotion.findUnique({ where: { slug: "ufc" } });
  if (!promotion) {
    throw new Error("UFC promotion not found");
  }

  const ufcFighters = await prisma.fighter.findMany({
    where: { promotionId: promotion.id },
    select: { id: true, slug: true, status: true }
  });

  let promoted = 0;
  let demoted = 0;

  for (const fighter of ufcFighters) {
    if (officialChampionSlugs.has(fighter.slug)) {
      if (fighter.status !== "champion") {
        await prisma.fighter.update({
          where: { id: fighter.id },
          data: { status: "champion" }
        });
        promoted += 1;
      }
      continue;
    }

    if (fighter.status !== "champion") {
      continue;
    }

    const html = await fetchText(`https://www.ufc.com/athlete/${fighter.slug}`);
    const nextStatus = parseStatusTag(html, "active");

    await prisma.fighter.update({
      where: { id: fighter.id },
      data: {
        status: nextStatus === "champion" ? "active" : nextStatus
      }
    });
    demoted += 1;
  }

  console.log(
    JSON.stringify(
      {
        officialChampionCount: officialChampionSlugs.size,
        promoted,
        demoted,
        champions: [...officialChampionSlugs].sort()
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
