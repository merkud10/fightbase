#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");

const {
  buildGenericBio,
  buildGenericBioEn,
  extractMetaContent,
  fetchText,
  getPreferredRussianName,
  normalizeCountry,
  slugify,
  stripTags,
  titleCase
} = require("./fighter-import-utils");
const { syncUfcFighterBySlug } = require("./sync-ufc-roster");

const prisma = new PrismaClient();

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) {
      continue;
    }

    const key = current.slice(2);
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

function splitBlocks(html, marker) {
  const parts = html.split(marker).slice(1);
  return parts.map((part) => marker + part);
}

function decodeName(value) {
  return stripTags(String(value || "").replace(/\s+/g, " ").trim());
}

function normalizeWeightClass(raw) {
  return titleCase(
    stripTags(String(raw || ""))
      .replace(/\btitle bout\b/gi, "")
      .replace(/\bworld championship\b/gi, "")
      .replace(/\bchampionship\b/gi, "")
      .replace(/\bbout\b/gi, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function inferFightStage(index, promotionSlug) {
  if (promotionSlug === "ufc") {
    return index < 5 ? "main_card" : "prelims";
  }

  return "main_card";
}

function parseUfcFightCard(html) {
  const blocks = splitBlocks(html, '<div class="c-listing-fight"');
  const fights = [];

  for (const block of blocks) {
    const hrefs = Array.from(block.matchAll(/href="https:\/\/www\.ufc\.com\/athlete\/([^"]+)"/gi)).map((match) => match[1]);
    const uniqueSlugs = Array.from(new Set(hrefs)).slice(0, 2);
    const names = Array.from(block.matchAll(/c-listing-fight__corner-name[^>]*>\s*<a [^>]+>([\s\S]*?)<\/a>/gi)).map((match) =>
      decodeName(match[1])
    );
    const uniqueNames = Array.from(new Set(names)).slice(0, 2);
    const weightClass = normalizeWeightClass(block.match(/c-listing-fight__class-text">([\s\S]*?)<\/div>/i)?.[1] || "");

    if (uniqueSlugs.length < 2 || uniqueNames.length < 2) {
      continue;
    }

    fights.push({
      fighterA: { slug: uniqueSlugs[0], name: uniqueNames[0], url: `https://www.ufc.com/athlete/${uniqueSlugs[0]}` },
      fighterB: { slug: uniqueSlugs[1], name: uniqueNames[1], url: `https://www.ufc.com/athlete/${uniqueSlugs[1]}` },
      weightClass
    });
  }

  return fights;
}

function parseOneFightCard(html) {
  const blocks = splitBlocks(html, '<div class="event-matchup ');
  const fights = [];

  for (const block of blocks) {
    const title = decodeName(block.match(/<div class="title">\s*([\s\S]*?)\s*<\/div>/i)?.[1] || "");
    const rows = Array.from(
      block.matchAll(/<a href="https:\/\/www\.onefc\.com\/athletes\/([^"\/]+)\/"[\s\S]*?title="([^"]+)"/gi)
    ).map((match) => ({
      slug: match[1],
      name: decodeName(match[2]),
      url: `https://www.onefc.com/athletes/${match[1]}/`
    }));

    if (rows.length < 2) {
      continue;
    }

    fights.push({
      fighterA: rows[0],
      fighterB: rows[1],
      weightClass: normalizeWeightClass(title)
    });
  }

  return fights;
}

async function ensureOneFighter(athlete) {
  const existing = await prisma.fighter.findUnique({ where: { slug: athlete.slug } });
  if (existing) {
    return existing;
  }

  const promotion = await prisma.promotion.findUnique({ where: { slug: "one" } });
  if (!promotion) {
    throw new Error("Promotion one not found");
  }

  const html = await fetchText(athlete.url);
  const title = stripTags((html.match(/<title>([^<]+)/i) || [])[1] || athlete.name).replace(/\s+-\s+ONE Championship[\s\S]*$/i, "");
  const photoUrl = extractMetaContent(html, "og:image") || null;
  const description = extractMetaContent(html, "og:description") || extractMetaContent(html, "description") || "";
  const countryMatch = description.match(/originally from ([A-Za-z\s-]+?)(?:[.,]|$)/i) || description.match(/represents ([A-Za-z\s-]+?)(?:[.,]|$)/i);
  const country = normalizeCountry(countryMatch?.[1] || "Unknown");
  const weightClassMatch = description.match(/(?:competes in|fights in|world champion in) ([A-Za-z\s-]+?)(?: division|\.|,)/i);
  const weightClass = titleCase(stripTags(weightClassMatch?.[1] || "Openweight"));

  return prisma.fighter.create({
    data: {
      slug: athlete.slug,
      name: title || athlete.name,
      nameRu: getPreferredRussianName(title || athlete.name),
      nickname: decodeName(description.match(/“([^”]+)”/)?.[1] || description.match(/"([^"]+)"/)?.[1] || ""),
      photoUrl,
      country,
      weightClass,
      status: "active",
      record: "0-0-0",
      age: 0,
      heightCm: 0,
      reachCm: 0,
      team: "",
      style: "MMA",
      bio: buildGenericBio({
        nameRu: getPreferredRussianName(title || athlete.name),
        promotionSlug: "one",
        country,
        weightClass,
        status: "active",
        nickname: decodeName(description.match(/“([^”]+)”/)?.[1] || ""),
        record: "0-0-0",
        team: "",
        highlights: "",
        description
      }),
      bioEn: buildGenericBioEn({
        name: title || athlete.name,
        promotionSlug: "one",
        country,
        weightClass,
        status: "active",
        nickname: decodeName(description.match(/“([^”]+)”/)?.[1] || ""),
        record: "0-0-0",
        team: "",
        highlights: "",
        description
      }),
      promotionId: promotion.id
    }
  });
}

async function ensureFighter(promotionSlug, athlete) {
  if (promotionSlug === "ufc") {
    const synced = await syncUfcFighterBySlug(prisma, athlete.slug);
    return synced.fighter;
  }

  if (promotionSlug === "one") {
    return ensureOneFighter(athlete);
  }

  const existing = await prisma.fighter.findUnique({ where: { slug: athlete.slug } });
  if (existing) {
    return existing;
  }

  const promotion = await prisma.promotion.findUnique({ where: { slug: promotionSlug } });
  if (!promotion) {
    throw new Error(`Promotion ${promotionSlug} not found`);
  }

  return prisma.fighter.create({
    data: {
      slug: athlete.slug || slugify(athlete.name),
      name: athlete.name,
      nameRu: getPreferredRussianName(athlete.name),
      nickname: null,
      photoUrl: null,
      country: "Unknown",
      weightClass: "Openweight",
      status: "active",
      record: "0-0-0",
      age: 0,
      heightCm: 0,
      reachCm: 0,
      team: "",
      style: "MMA",
      bio: buildGenericBio({
        nameRu: getPreferredRussianName(athlete.name),
        promotionSlug,
        country: "Unknown",
        weightClass: "Openweight",
        status: "active",
        nickname: "",
        record: "0-0-0",
        team: "",
        highlights: "",
        description: ""
      }),
      bioEn: buildGenericBioEn({
        name: athlete.name,
        promotionSlug,
        country: "Unknown",
        weightClass: "Openweight",
        status: "active",
        nickname: "",
        record: "0-0-0",
        team: "",
        highlights: "",
        description: ""
      }),
      promotionId: promotion.id
    }
  });
}

function buildEventUrl(event) {
  if (event.promotion.slug === "ufc") {
    return `https://www.ufc.com/event/${event.slug}`;
  }

  if (event.promotion.slug === "one") {
    return `https://www.onefc.com/events/${event.slug}/`;
  }

  return "";
}

function parseFightCard(event, html) {
  if (event.promotion.slug === "ufc") {
    return parseUfcFightCard(html);
  }

  if (event.promotion.slug === "one") {
    return parseOneFightCard(html);
  }

  return [];
}

async function syncEventFightCard(event) {
  const eventUrl = buildEventUrl(event);
  if (!eventUrl) {
    return { skipped: true };
  }

  const html = await fetchText(eventUrl);
  const fights = parseFightCard(event, html);

  if (fights.length === 0) {
    return { skipped: true };
  }

  await prisma.fight.deleteMany({
    where: {
      eventId: event.id,
      status: "scheduled"
    }
  });

  let created = 0;

  for (let index = 0; index < fights.length; index += 1) {
    const fight = fights[index];
    const fighterA = await ensureFighter(event.promotion.slug, fight.fighterA);
    const fighterB = await ensureFighter(event.promotion.slug, fight.fighterB);

    await prisma.fight.create({
      data: {
        eventId: event.id,
        fighterAId: fighterA.id,
        fighterBId: fighterB.id,
        stage: inferFightStage(index, event.promotion.slug),
        weightClass: fight.weightClass || fighterA.weightClass || fighterB.weightClass || "Openweight",
        status: "scheduled"
      }
    });
    created += 1;
  }

  return { created };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const limit = Number(args.limit || "20") || 20;
  const promotionFilter = String(args.promotion || "").trim();

  const events = await prisma.event.findMany({
    where: {
      status: { in: ["upcoming", "live"] },
      ...(promotionFilter ? { promotion: { slug: promotionFilter } } : { promotion: { slug: { in: ["ufc", "one"] } } })
    },
    include: {
      promotion: true
    },
    orderBy: { date: "asc" },
    take: limit
  });

  let updatedEvents = 0;
  let createdFights = 0;
  let skipped = 0;

  for (const event of events) {
    try {
      const result = await syncEventFightCard(event);
      if (result?.created) {
        updatedEvents += 1;
        createdFights += result.created;
        console.log(`[fight-card] ${event.slug}: ${result.created} fights`);
      } else {
        skipped += 1;
      }
    } catch (error) {
      skipped += 1;
      console.error(`[fight-card] skipped ${event.slug}: ${error.message || error}`);
    }
  }

  console.log("");
  console.log("Summary");
  console.log(`Updated events: ${updatedEvents}`);
  console.log(`Created fights: ${createdFights}`);
  console.log(`Skipped: ${skipped}`);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
