#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");

const { fetchText, parseArgs } = require("./fighter-import-utils");

const prisma = new PrismaClient();

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

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

function localSlugify(value) {
  return transliterateLatin(value)
    .toLowerCase()
    .replace(/['".]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

function isArticleLike(value) {
  return /i am still here|wants this|journey continues|ufc edmonton|ufc vegas|mexico city|student of the game|calm cool and collected|losing is not an option/i.test(
    String(value || "")
  );
}

function hasOfficialDataMarkers(html) {
  return /hero-profile__name|id="athlete-record"|c-bio__label/i.test(html);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const limit = args.limit ? Number.parseInt(args.limit, 10) : null;

  const fighters = await prisma.fighter.findMany({
    where: {
      promotion: { slug: "ufc" },
      status: { in: ["active", "champion", "prospect"] }
    },
    select: {
      id: true,
      slug: true,
      name: true,
      nameRu: true,
      status: true
    },
    orderBy: { name: "asc" }
  });

  const suspicious = fighters.filter((fighter) => {
    const slugNorm = normalize(fighter.slug.replace(/-\d+$/g, "").replace(/-/g, " "));
    const nameNorm = normalize(transliterateLatin(fighter.name));
    const overlap = slugNorm
      .split(/\s+/)
      .filter(Boolean)
      .some((token) => nameNorm.split(/\s+/).includes(token));

    return isArticleLike(fighter.slug) || isArticleLike(fighter.name) || !overlap;
  });

  const scoped = limit ? suspicious.slice(0, limit) : suspicious;
  let repaired = 0;
  let skipped = 0;
  let failed = 0;

  for (const fighter of scoped) {
    try {
      if (isArticleLike(fighter.name)) {
        skipped += 1;
        continue;
      }

      const targetSlug = localSlugify(fighter.name);
      if (!targetSlug || targetSlug === fighter.slug) {
        skipped += 1;
        continue;
      }

      const taken = await prisma.fighter.findUnique({
        where: { slug: targetSlug },
        select: { id: true }
      });
      if (taken && taken.id !== fighter.id) {
        skipped += 1;
        continue;
      }

      const html = await fetchText(`https://www.ufc.com/athlete/${targetSlug}`);
      if (!hasOfficialDataMarkers(html)) {
        skipped += 1;
        continue;
      }

      const title = (html.match(/<title>(.*?)<\/title>/i) || [,""])[1];
      const nameNorm = normalize(transliterateLatin(fighter.name));
      const titleNorm = normalize(transliterateLatin(title));
      const surname = nameNorm.split(/\s+/).slice(-1)[0] || nameNorm;

      if (!titleNorm.includes(surname)) {
        skipped += 1;
        continue;
      }

      await prisma.fighter.update({
        where: { id: fighter.id },
        data: { slug: targetSlug }
      });

      repaired += 1;
      console.log(`Repaired UFC local slug: ${fighter.name} -> ${targetSlug}`);
    } catch (error) {
      failed += 1;
      console.error(`Failed UFC local slug repair for ${fighter.name}: ${error.message || error}`);
    }
  }

  console.log(JSON.stringify({ checked: scoped.length, repaired, skipped, failed }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
