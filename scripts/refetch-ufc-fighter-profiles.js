#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");
const { parseArgs } = require("./fighter-import-utils");
const { syncUfcFighterBySlug } = require("./sync-ufc-roster");

const prisma = new PrismaClient();

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const limit = args.limit ? Number.parseInt(args.limit, 10) : null;
  const offset = args.offset ? Number.parseInt(args.offset, 10) : 0;
  const concurrency = Math.max(1, Number.parseInt(args.concurrency || "8", 10));
  const useDeepSeek = args.deepseek === "false" ? false : true;

  const fighters = await prisma.fighter.findMany({
    where: {
      promotion: {
        slug: "ufc"
      }
    },
    orderBy: { slug: "asc" },
    select: { slug: true }
  });

  const scoped = fighters.slice(offset, limit ? offset + limit : undefined);
  let completed = 0;
  let failed = 0;

  console.log(`Found ${fighters.length} UFC fighters in database. Processing ${scoped.length} with concurrency ${concurrency}.`);

  for (let index = 0; index < scoped.length; index += concurrency) {
    const chunk = scoped.slice(index, index + concurrency);
    const results = await Promise.allSettled(
      chunk.map(async ({ slug }) => {
        const { fighter, created } = await syncUfcFighterBySlug(prisma, slug, { useDeepSeek });
        return { slug, fighter, created };
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        completed += 1;
        console.log(`[${completed}/${scoped.length}] Refreshed UFC fighter: ${result.value.fighter.name}`);
      } else {
        failed += 1;
        console.error(`Failed UFC refetch: ${result.reason?.message || result.reason}`);
      }
    }
  }

  console.log(JSON.stringify({ processed: scoped.length, completed, failed }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
