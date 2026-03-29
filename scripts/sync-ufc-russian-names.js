#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");

const { buildGenericBio, fetchText, parseArgs, stripTags } = require("./fighter-import-utils");

const prisma = new PrismaClient();

function decodeXml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractRussianName(html) {
  const title = stripTags((html.match(/<title>(.*?)<\/title>/i) || [])[1] || "").replace(/\s*\|\s*UFC\s*$/i, "").trim();
  const h1 = stripTags((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || "").trim();
  return h1 || title || "";
}

function extractEnglishName(html) {
  const description = stripTags((html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"]+)["']/i) || [])[1] || "");
  const personSchemaName = stripTags((html.match(/"@type"\s*:\s*"Person"[\s\S]*?"name"\s*:\s*"([^"]+)"/i) || [])[1] || "");

  const fromDescription = description.match(/^(.+?)\s+is\s+/i)?.[1]?.trim();
  return fromDescription || personSchemaName || "";
}

function looksLikeRussianName(value) {
  return /[А-Яа-яЁё]/.test(String(value || ""));
}

function shouldReplaceBio(existingBio, oldNameRu) {
  const bio = String(existingBio || "");
  if (!bio) {
    return false;
  }

  return bio.startsWith(`${oldNameRu} —`) || bio.includes(oldNameRu);
}

async function collectUfcRuAthleteUrls() {
  const sitemapIndex = await fetchText("https://ufc.ru/sitemap.xml");
  const pages = [...sitemapIndex.matchAll(/<loc>(https:\/\/ufc\.ru\/sitemap\.xml\?page=\d+)<\/loc>/gi)].map((match) => decodeXml(match[1]));
  const urls = new Set();

  for (const pageUrl of pages) {
    const pageXml = await fetchText(pageUrl);
    for (const match of pageXml.matchAll(/<loc>(https:\/\/ufc\.ru\/athlete\/[^<]+)<\/loc>/gi)) {
      urls.add(decodeXml(match[1]));
    }
  }

  return [...urls];
}

async function asyncPool(items, limit, worker) {
  const executing = new Set();
  const results = [];

  for (const item of items) {
    const promise = Promise.resolve().then(() => worker(item));
    results.push(promise);
    executing.add(promise);

    const finalize = () => executing.delete(promise);
    promise.then(finalize).catch(finalize);

    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }

  return Promise.all(results);
}

async function mapOfficialRussianNames(concurrency = 20) {
  const athleteUrls = await collectUfcRuAthleteUrls();
  const map = new Map();

  await asyncPool(athleteUrls, concurrency, async (url) => {
    try {
      const html = await fetchText(url);
      const nameRu = extractRussianName(html);
      const name = extractEnglishName(html);

      if (!name || !nameRu || !looksLikeRussianName(nameRu)) {
        return;
      }

      if (!map.has(name)) {
        map.set(name, nameRu);
      }
    } catch (error) {
      console.error(`Failed UFC.ru athlete page ${url}: ${error.message || error}`);
    }
  });

  return map;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const limit = args.limit ? Number.parseInt(args.limit, 10) : null;
  const concurrency = args.concurrency ? Number.parseInt(args.concurrency, 10) : 20;

  const [promotion, officialNames] = await Promise.all([
    prisma.promotion.findUnique({ where: { slug: "ufc" } }),
    mapOfficialRussianNames(concurrency)
  ]);

  if (!promotion) {
    throw new Error("UFC promotion not found");
  }

  const fighters = await prisma.fighter.findMany({
    where: { promotionId: promotion.id },
    orderBy: { name: "asc" }
  });

  const scoped = limit ? fighters.slice(0, limit) : fighters;
  let updated = 0;
  let matched = 0;

  for (const fighter of scoped) {
    const officialNameRu = officialNames.get(fighter.name);
    if (!officialNameRu || fighter.nameRu === officialNameRu) {
      continue;
    }

    matched += 1;
    const nextBio = shouldReplaceBio(fighter.bio, fighter.nameRu)
      ? String(fighter.bio || "").replaceAll(fighter.nameRu || fighter.name, officialNameRu)
      : fighter.bio;

    await prisma.fighter.update({
      where: { id: fighter.id },
      data: {
        nameRu: officialNameRu,
        bio:
          nextBio ||
          buildGenericBio({
            nameRu: officialNameRu,
            promotionSlug: "ufc",
            country: fighter.country,
            weightClass: fighter.weightClass,
            status: fighter.status,
            nickname: fighter.nickname,
            record: fighter.record,
            team: fighter.team,
            highlights: "",
            style: fighter.style,
            winsByKnockout: fighter.winsByKnockout,
            winsBySubmission: fighter.winsBySubmission
          })
      }
    });

    updated += 1;
    console.log(`Updated UFC Russian name: ${fighter.name} -> ${officialNameRu}`);
  }

  console.log(
    JSON.stringify(
      {
        officialNameMapSize: officialNames.size,
        scanned: scoped.length,
        matched,
        updated
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
