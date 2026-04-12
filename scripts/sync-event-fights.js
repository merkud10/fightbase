#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");

const { parseArgs } = require("./fighter-import-utils");

const prisma = new PrismaClient();

const ESPN_SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard";

const WEIGHT_CLASS_MAP = {
  Strawweight: "Strawweight",
  Flyweight: "Flyweight",
  Bantamweight: "Bantamweight",
  Featherweight: "Featherweight",
  Lightweight: "Lightweight",
  Welterweight: "Welterweight",
  Middleweight: "Middleweight",
  "Light Heavyweight": "Light Heavyweight",
  Heavyweight: "Heavyweight",
  "W Strawweight": "Women's Strawweight",
  "W Flyweight": "Women's Flyweight",
  "W Bantamweight": "Women's Bantamweight",
  "W Featherweight": "Women's Featherweight"
};

function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      Accept: "application/json"
    },
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    throw new Error(`ESPN API HTTP ${response.status} for ${url}`);
  }

  return response.json();
}

function parseMethod(competition) {
  const details = competition.details || [];

  for (const detail of details) {
    const text = detail.type?.text || "";
    if (text.includes("Decision")) return "Decision";
    if (text.includes("Submission")) return "Submission";
    if (text.includes("Kotko") || text.includes("KO") || text.includes("TKO")) return "KO/TKO";
  }

  return null;
}

function parseResultTime(competition) {
  const status = competition.status || {};
  const totalSeconds = Math.round(status.clock ?? 0);
  const roundLength = 300;
  const elapsed = roundLength - totalSeconds;

  if (elapsed > 0 && elapsed < roundLength) {
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  return status.displayClock || null;
}

function inferStage(competition, index, total) {
  const broadcasts = competition.broadcasts || [];
  const broadcastNames = broadcasts.flatMap((b) => b.names || []).map((n) => n.toLowerCase());
  const isTvBroadcast = broadcastNames.some((n) => n.includes("cbs") || n.includes("fox") || n.includes("abc"));

  if (isTvBroadcast || index >= total - 5) {
    return "main_card";
  }
  if (index >= total - 9) {
    return "prelims";
  }
  return "early_prelims";
}

function parseFightsFromEspn(data) {
  const event = data.events?.[0];
  if (!event) return [];

  const competitions = event.competitions || [];
  const fights = [];

  for (let i = 0; i < competitions.length; i++) {
    const comp = competitions[i];
    const competitors = comp.competitors || [];
    if (competitors.length < 2) continue;

    const fighterA = competitors.find((c) => c.order === 1) || competitors[0];
    const fighterB = competitors.find((c) => c.order === 2) || competitors[1];

    const isCompleted = comp.status?.type?.completed === true;
    const weightClassRaw = comp.type?.abbreviation || "";
    const weightClass = WEIGHT_CLASS_MAP[weightClassRaw] || weightClassRaw;

    let winnerOrder = null;
    if (isCompleted) {
      if (fighterA.winner === true) winnerOrder = "a";
      else if (fighterB.winner === true) winnerOrder = "b";
    }

    const method = isCompleted ? parseMethod(comp) : null;
    const resultRound = isCompleted ? (comp.status?.period ?? null) : null;
    const resultTime = isCompleted && method !== "Decision" ? parseResultTime(comp) : null;

    fights.push({
      stage: inferStage(comp, i, competitions.length),
      weightClass: weightClass || "Unknown",
      fighterA: {
        name: fighterA.athlete?.displayName || fighterA.athlete?.fullName || "Unknown",
        slug: slugify(fighterA.athlete?.displayName || "unknown")
      },
      fighterB: {
        name: fighterB.athlete?.displayName || fighterB.athlete?.fullName || "Unknown",
        slug: slugify(fighterB.athlete?.displayName || "unknown")
      },
      hasResult: isCompleted,
      winnerOrder,
      method,
      resultRound,
      resultTime
    });
  }

  return fights;
}

async function findFighterByName(name) {
  const slug = slugify(name);

  const bySlug = await prisma.fighter.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true }
  });
  if (bySlug) return bySlug;

  const byName = await prisma.fighter.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true, slug: true, name: true }
  });
  if (byName) return byName;

  const nameParts = name.split(" ");
  if (nameParts.length >= 2) {
    const lastName = nameParts[nameParts.length - 1];
    const candidates = await prisma.fighter.findMany({
      where: { name: { contains: lastName, mode: "insensitive" } },
      select: { id: true, slug: true, name: true }
    });

    if (candidates.length === 1) return candidates[0];

    const firstName = nameParts[0];
    const exact = candidates.find((c) =>
      c.name.toLowerCase().includes(firstName.toLowerCase()) &&
      c.name.toLowerCase().includes(lastName.toLowerCase())
    );
    if (exact) return exact;
  }

  return null;
}

async function ensureFighter(name) {
  const existing = await findFighterByName(name);
  if (existing) return existing;

  const slug = slugify(name);
  let uniqueSlug = slug;
  let counter = 2;
  while (await prisma.fighter.findUnique({ where: { slug: uniqueSlug } })) {
    uniqueSlug = `${slug}-${counter}`;
    counter++;
  }

  const fighter = await prisma.fighter.create({
    data: {
      slug: uniqueSlug,
      name,
      country: "",
      record: "",
      weightClass: "",
      stance: "",
      bio: ""
    },
    select: { id: true, slug: true, name: true }
  });

  console.log(`  [new fighter] ${name} -> ${uniqueSlug}`);
  return fighter;
}

function buildFightKey(fighterAId, fighterBId) {
  return [fighterAId, fighterBId].sort().join(":");
}

async function syncEventFightCard(event) {
  const eventDate = new Date(event.date);
  const datesToTry = [];

  for (const offset of [0, -1, 1]) {
    const d = new Date(eventDate);
    d.setUTCDate(d.getUTCDate() + offset);
    datesToTry.push(d.toISOString().slice(0, 10).replace(/-/g, ""));
  }

  let parsedFights = [];

  for (const d of datesToTry) {
    try {
      const data = await fetchJson(`${ESPN_SCOREBOARD_URL}?dates=${d}`);
      parsedFights = parseFightsFromEspn(data);
      if (parsedFights.length > 0) break;
    } catch (error) {
      console.warn(`  ESPN fetch for date ${d} failed: ${error.message}`);
    }
  }

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
    const fighterA = await ensureFighter(parsedFight.fighterA.name);
    const fighterB = await ensureFighter(parsedFight.fighterB.name);
    const key = buildFightKey(fighterA.id, fighterB.id);
    seenKeys.add(key);

    const winnerFighterId = parsedFight.winnerOrder === "a" ? fighterA.id
      : parsedFight.winnerOrder === "b" ? fighterB.id
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

  const staleFightIds = existingFights
    .filter((fight) => !seenKeys.has(buildFightKey(fight.fighterAId, fight.fighterBId)))
    .map((fight) => fight.id);

  if (staleFightIds.length > 0) {
    await prisma.fight.deleteMany({
      where: {
        id: { in: staleFightIds },
        status: "scheduled"
      }
    });
  }

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

  console.log(`Syncing fight cards for ${events.length} event(s) via ESPN API...`);

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
        console.log(`[skipped] ${result.eventSlug}: no fight card found on ESPN`);
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
