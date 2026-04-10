#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");

const { persistImageLocally } = require("./local-image-store");

const prisma = new PrismaClient();

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const limit = args.limit ? Number.parseInt(args.limit, 10) : null;
  const offset = args.offset ? Number.parseInt(args.offset, 10) : 0;
  const concurrency = args.concurrency ? Math.max(1, Number.parseInt(args.concurrency, 10)) : 10;

  const fighters = await prisma.fighter.findMany({
    where: {
      photoUrl: { startsWith: "http" }
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      photoUrl: true
    }
  });

  const backlog = fighters.slice(offset, limit ? offset + limit : undefined);
  let updated = 0;
  let failed = 0;
  let cursor = 0;

  console.log(`Backfilling ${backlog.length} fighter images with concurrency ${concurrency}.`);

  async function worker() {
    while (cursor < backlog.length) {
      const index = cursor;
      cursor += 1;
      const fighter = backlog[index];

      try {
        const localizedPhotoUrl = await persistImageLocally({
          bucket: "fighters",
          key: fighter.slug,
          sourceUrl: fighter.photoUrl
        });

        if (!localizedPhotoUrl || localizedPhotoUrl === fighter.photoUrl) {
          continue;
        }

        await prisma.fighter.update({
          where: { id: fighter.id },
          data: {
            photoUrl: localizedPhotoUrl
          }
        });

        updated += 1;
        console.log(`Localized fighter image: ${fighter.slug}`);
      } catch (error) {
        failed += 1;
        console.error(`Failed fighter image backfill for ${fighter.slug}: ${error.message || error}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, backlog.length || 1) }, () => worker()));

  console.log(JSON.stringify({ checked: backlog.length, updated, failed }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
