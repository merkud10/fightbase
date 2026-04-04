#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function main() {
  const fights = await prisma.fight.findMany({
    where: { slug: null },
    include: {
      fighterA: { select: { slug: true } },
      fighterB: { select: { slug: true } }
    }
  });

  console.log(`Found ${fights.length} fights without slug`);

  const usedSlugs = new Set();

  // Pre-load existing slugs
  const existing = await prisma.fight.findMany({
    where: { slug: { not: null } },
    select: { slug: true }
  });
  for (const f of existing) {
    if (f.slug) usedSlugs.add(f.slug);
  }

  let updated = 0;

  for (const fight of fights) {
    let baseSlug = `${slugify(fight.fighterA.slug)}-vs-${slugify(fight.fighterB.slug)}`;
    let slug = baseSlug;
    let counter = 2;

    while (usedSlugs.has(slug)) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    usedSlugs.add(slug);

    await prisma.fight.update({
      where: { id: fight.id },
      data: { slug }
    });

    updated++;
    console.log(`  ${slug}`);
  }

  console.log(`\nUpdated ${updated} fights`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
