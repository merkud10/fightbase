#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");

const { fetchText, parseArgs, stripTags, titleCase } = require("./fighter-import-utils");
const { syncUfcFighterBySlug } = require("./sync-ufc-roster");

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

async function generateFightSlug(fighterASlug, fighterBSlug) {
  const baseSlug = `${slugify(fighterASlug)}-vs-${slugify(fighterBSlug)}`;
  let slug = baseSlug;
  let counter = 2;

  while (await prisma.fight.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
}

const SECTION_CONFIG = [
  { ids: ["main-card", "main-card-id"], stage: "main_card", label: "Main Card" },
  { ids: ["prelims-card", "prelims-card-id"], stage: "prelims", label: "Prelims" },
  { ids: ["early-prelims", "early-prelims-id"], stage: "early_prelims", label: "Early Prelims" }
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

function findSectionStart(html, sectionIds) {
  for (const id of sectionIds) {
    const index = html.indexOf(`id="${id}"`);
    if (index !== -1) return index;
  }
  return -1;
}

function extractSectionHtml(html, sectionIds) {
  const sectionStart = findSectionStart(html, sectionIds);
  if (sectionStart === -1) {
    return "";
  }

  const tail = html.slice(sectionStart);
  const allIds = SECTION_CONFIG.flatMap((section) => section.ids);
  const nextIndices = allIds.map((id) => tail.indexOf(`id="${id}"`))
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

function parseCornerOutcome(chunk, corner) {
  const cornerBlock = chunk.match(new RegExp(`c-listing-fight__corner-body--${corner}[\\s\\S]*?outcome-wrapper[\\s\\S]*?outcome--(win|loss|draw|nc)`, "i"));
  return cornerBlock?.[1]?.toLowerCase() || "";
}

function parseResultDetails(chunk) {
  const methodMatch = chunk.match(/Method<\/div>\s*<div[^>]*>([\s\S]*?)<\/div>/i);
  const roundMatch = chunk.match(/Round<\/div>\s*<div[^>]*>(\d+)<\/div>/i);
  const timeMatch = chunk.match(/Time<\/div>\s*<div[^>]*>([\d:]+)<\/div>/i);

  return {
    method: stripTags(methodMatch?.[1] || "").trim() || null,
    round: roundMatch?.[1] ? parseInt(roundMatch[1], 10) : null,
    time: timeMatch?.[1]?.trim() || null
  };
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

  const redOutcome = parseCornerOutcome(chunk, "red");
  const blueOutcome = parseCornerOutcome(chunk, "blue");
  const hasResult = redOutcome === "win" || blueOutcome === "win" || redOutcome === "draw" || redOutcome === "nc";
  const resultDetails = hasResult ? parseResultDetails(chunk) : null;

  let winnerCorner = null;
  if (redOutcome === "win") winnerCorner = "red";
  else if (blueOutcome === "win") winnerCorner = "blue";

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
    },
    hasResult,
    winnerCorner,
    method: resultDetails?.method || null,
    resultRound: resultDetails?.round || null,
    resultTime: resultDetails?.time || null
  };
}

function parseFightCard(html) {
  const fights = [];

  // Try section-based parsing first (completed events with main-card / prelims sections)
  for (const section of SECTION_CONFIG) {
    const sectionHtml = extractSectionHtml(html, section.ids);
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

  if (fights.length > 0) {
    return fights;
  }

  // Fallback: parse all c-listing-fight blocks from the entire page (upcoming events)
  for (const chunk of extractFightCardBlocks(html)) {
    const parsed = parseFightBlock(chunk, "main_card");
    if (parsed) {
      fights.push(parsed);
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

    const winnerFighterId = parsedFight.winnerCorner === "red" ? fighterA.id
      : parsedFight.winnerCorner === "blue" ? fighterB.id
      : null;

    const data = {
      stage: parsedFight.stage,
      weightClass: parsedFight.weightClass,
      status: parsedFight.hasResult ? "completed" : "scheduled",
      fighterAId: fighterA.id,
      fighterBId: fighterB.id,
      eventId: event.id,
      ...(parsedFight.hasResult ? {
        winnerFighterId,
        method: parsedFight.method,
        resultRound: parsedFight.resultRound,
        resultTime: parsedFight.resultTime
      } : {})
    };

    const existing = existingByKey.get(key);
    if (existing) {
      const updateData = { ...data };
      if (!existing.slug) {
        updateData.slug = await generateFightSlug(fighterA.slug, fighterB.slug);
      }
      await prisma.fight.update({
        where: { id: existing.id },
        data: updateData
      });
      updated += 1;
      continue;
    }

    data.slug = await generateFightSlug(fighterA.slug, fighterB.slug);
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

  // Auto-complete event if all fights have results
  const allFightsCompleted = parsedFights.length > 0 && parsedFights.every((f) => f.hasResult);
  if (allFightsCompleted && event.status !== "completed") {
    await prisma.event.update({
      where: { id: event.id },
      data: { status: "completed" }
    });
  }

  return {
    eventSlug: event.slug,
    created,
    updated,
    removed: staleFightIds.length,
    skipped: false,
    completedEvent: allFightsCompleted
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const limit = Number(args.limit || 0) || null;
  const eventSlug = String(args.event || "").trim();
  const recentCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const events = await prisma.event.findMany({
    where: {
      promotion: { slug: "ufc" },
      OR: [
        { status: { in: ["upcoming", "live"] } },
        { status: "completed", date: { gte: recentCutoff } }
      ],
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
        const suffix = result.completedEvent ? " [EVENT COMPLETED]" : "";
        console.log(
          `[synced] ${result.eventSlug}: created ${result.created}, updated ${result.updated}, removed ${result.removed}${suffix}`
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
