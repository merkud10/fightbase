#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");

const { fetchText, parseArgs, stripTags, titleCase } = require("./fighter-import-utils");
const { syncUfcFighterBySlug } = require("./sync-ufc-roster");

const prisma = new PrismaClient();

const SECTION_CONFIG = [
  { id: "main-card", stage: "main_card", label: "Main Card" },
  { id: "prelims-card", stage: "prelims", label: "Prelims" },
  { id: "early-prelims", stage: "early_prelims", label: "Early Prelims" }
];

function normalizeWhitespace(value) {
  return stripTags(String(value || "")).replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/gi, "'")
    .replace(/&ldquo;|&rdquo;/gi, '"')
    .replace(/&rsquo;/gi, "'")
    .replace(/&ndash;|&mdash;/gi, "-");
}

function buildEventUrl(slug) {
  return `https://www.ufc.com/event/${slug}`;
}

function extractSectionHtml(html, sectionId) {
  const sectionStart = html.indexOf(`id="${sectionId}"`);
  if (sectionStart === -1) {
    return "";
  }

  const tail = html.slice(sectionStart);
  const nextIndices = SECTION_CONFIG.map((section) => tail.indexOf(`id="${section.id}"`))
    .filter((index) => index > 0)
    .sort((a, b) => a - b);
  const end = nextIndices[0] ?? tail.length;
  return tail.slice(0, end);
}

function extractAthleteSlugs(chunk) {
  const slugs = [];

  for (const match of chunk.matchAll(/href="(?:https:\/\/www\.ufc\.com)?\/athlete\/([^"?#/]+)"/gi)) {
    const slug = String(match[1] || "").trim();
    if (slug && !slugs.includes(slug)) {
      slugs.push(slug);
    }
  }

  return slugs;
}

function extractCornerName(chunk, corner) {
  const givenMatch = chunk.match(
    new RegExp(`c-listing-fight__corner-name--${corner}[\\s\\S]*?c-listing-fight__corner-given-name">([\\s\\S]*?)<`, "i")
  );
  const familyMatch = chunk.match(
    new RegExp(`c-listing-fight__corner-name--${corner}[\\s\\S]*?c-listing-fight__corner-family-name">([\\s\\S]*?)<`, "i")
  );
  const fullName = [normalizeWhitespace(givenMatch?.[1] || ""), normalizeWhitespace(familyMatch?.[1] || "")]
    .filter(Boolean)
    .join(" ")
    .trim();

  return fullName;
}

function extractFightCardBlocks(sectionHtml) {
  return sectionHtml
    .split('<div class="c-listing-fight"')
    .slice(1)
    .map((chunk) => `<div class="c-listing-fight"${chunk}`)
    .filter(Boolean);
}

function normalizeWeightClassLabel(value) {
  return titleCase(
    decodeHtmlEntities(String(value || ""))
      .replace(/\s*bout$/i, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function parseFightBlock(chunk, stage) {
  const athleteSlugs = extractAthleteSlugs(chunk);
  if (athleteSlugs.length < 2) {
    return null;
  }

  const fighterAName = extractCornerName(chunk, "red");
  const fighterBName = extractCornerName(chunk, "blue");
  const weightClassRaw = chunk.match(/c-listing-fight__class-text">([\s\S]*?)</i)?.[1] || "";
  const weightClass = normalizeWeightClassLabel(weightClassRaw);

  if (!fighterAName || !fighterBName || !weightClass) {
    return null;
  }

  return {
    stage,
    weightClass,
    fighterA: {
      slug: athleteSlugs[0],
      name: fighterAName
    },
    fighterB: {
      slug: athleteSlugs[1],
      name: fighterBName
    }
  };
}

function parseFightCard(html) {
  const fights = [];

  for (const section of SECTION_CONFIG) {
    const sectionHtml = extractSectionHtml(html, section.id);
    if (!sectionHtml) {
      continue;
    }

    for (const chunk of extractFightCardBlocks(sectionHtml)) {
      const parsed = parseFightBlock(chunk, section.stage);
      if (parsed) {
        fights.push(parsed);
      }
    }
  }

  return fights;
}

async function ensureFighterBySlug(slug) {
  const existing = await prisma.fighter.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true }
  });

  if (existing) {
    return existing;
  }

  const synced = await syncUfcFighterBySlug(prisma, slug);
  return synced.fighter;
}

function buildFightKey(fighterAId, fighterBId) {
  return [fighterAId, fighterBId].sort().join(":");
}

async function syncEventFightCard(event) {
  const url = buildEventUrl(event.slug);
  const html = await fetchText(url);
  const parsedFights = parseFightCard(html);

  if (parsedFights.length === 0) {
    return {
      eventSlug: event.slug,
      created: 0,
      updated: 0,
      removed: 0,
      skipped: true
    };
  }

  const existingFights = await prisma.fight.findMany({
    where: { eventId: event.id },
    include: {
      fighterA: { select: { id: true, slug: true } },
      fighterB: { select: { id: true, slug: true } }
    }
  });

  const existingByKey = new Map(existingFights.map((fight) => [buildFightKey(fight.fighterAId, fight.fighterBId), fight]));
  const seenKeys = new Set();

  let created = 0;
  let updated = 0;

  for (const parsedFight of parsedFights) {
    const fighterA = await ensureFighterBySlug(parsedFight.fighterA.slug);
    const fighterB = await ensureFighterBySlug(parsedFight.fighterB.slug);
    const key = buildFightKey(fighterA.id, fighterB.id);
    seenKeys.add(key);

    const data = {
      stage: parsedFight.stage,
      weightClass: parsedFight.weightClass,
      status: "scheduled",
      fighterAId: fighterA.id,
      fighterBId: fighterB.id,
      eventId: event.id
    };

    const existing = existingByKey.get(key);
    if (existing) {
      await prisma.fight.update({
        where: { id: existing.id },
        data
      });
      updated += 1;
      continue;
    }

    await prisma.fight.create({ data });
    created += 1;
  }

  const staleFightIds = existingFights.filter((fight) => !seenKeys.has(buildFightKey(fight.fighterAId, fight.fighterBId))).map((fight) => fight.id);
  if (staleFightIds.length > 0) {
    await prisma.fight.deleteMany({
      where: {
        id: { in: staleFightIds },
        status: "scheduled"
      }
    });
  }

  return {
    eventSlug: event.slug,
    created,
    updated,
    removed: staleFightIds.length,
    skipped: false
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const limit = Number(args.limit || 0) || null;
  const eventSlug = String(args.event || "").trim();

  const events = await prisma.event.findMany({
    where: {
      promotion: { slug: "ufc" },
      status: { in: ["upcoming", "live"] },
      ...(eventSlug ? { slug: eventSlug } : {})
    },
    orderBy: { date: "asc" },
    take: limit ?? undefined
  });

  if (events.length === 0) {
    console.log("No UFC events found for fight-card sync.");
    return;
  }

  let created = 0;
  let updated = 0;
  let removed = 0;
  let skipped = 0;

  for (const event of events) {
    try {
      const result = await syncEventFightCard(event);
      created += result.created;
      updated += result.updated;
      removed += result.removed;
      skipped += result.skipped ? 1 : 0;

      if (result.skipped) {
        console.log(`[skipped] ${result.eventSlug}: no fight card found yet`);
      } else {
        console.log(
          `[synced] ${result.eventSlug}: created ${result.created}, updated ${result.updated}, removed ${result.removed}`
        );
      }
    } catch (error) {
      skipped += 1;
      console.error(`[failed] ${event.slug}: ${error.message || error}`);
    }
  }

  console.log("");
  console.log("Fight card sync summary");
  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
  console.log(`Removed: ${removed}`);
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
