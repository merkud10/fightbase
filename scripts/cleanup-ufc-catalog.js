#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");

const { fetchText, parseArgs, saveRecentFights, titleCase } = require("./fighter-import-utils");
const { collectUfcRosterEntries, parseUfcProfile, parseUfcRecentFights } = require("./sync-ufc-roster");

const prisma = new PrismaClient();

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenSignature(value) {
  return normalizeName(value)
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

function looksLikeArticleSlug(value) {
  const clean = String(value || "").toLowerCase();
  return /ufc-|wants-|i-am-still-here|edmonton|mexico-city|vegas|preview|results|fight-night/.test(clean);
}

function hasOfficialDataMarkers(html) {
  return (
    /hero-profile__name/i.test(html) ||
    /id="athlete-record"/i.test(html) ||
    /c-stat-compare__label/i.test(html) ||
    /c-bio__label/i.test(html)
  );
}

function isSevereLegacy(fighter) {
  const missingVitals = !fighter.age || !fighter.heightCm || !fighter.reachCm;
  const missingStats =
    fighter.sigStrikesLandedPerMin == null &&
    fighter.strikeAccuracy == null &&
    fighter.sigStrikesAbsorbedPerMin == null &&
    fighter.strikeDefense == null &&
    fighter.takedownAveragePer15 == null &&
    fighter.takedownAccuracy == null &&
    fighter.takedownDefense == null &&
    fighter.submissionAveragePer15 == null;
  const noHistory = fighter._count.recentFights === 0;
  const noPhoto = !fighter.photoUrl;
  const weakMeta = !fighter.record && !fighter.team;

  return (missingVitals && missingStats && noHistory && noPhoto) || (noHistory && weakMeta && looksLikeArticleSlug(fighter.slug));
}

async function backfillFromSlug(fighter, slug, rosterEntry) {
  const html = await fetchText(`https://www.ufc.com/athlete/${slug}`);
  if (!hasOfficialDataMarkers(html)) {
    return { ok: false };
  }

  const profile = parseUfcProfile(html, slug, fighter);
  const recentFights = parseUfcRecentFights(
    html,
    slug,
    profile.name,
    titleCase(profile.weightClass || fighter.weightClass || "")
  );

  await prisma.fighter.update({
    where: { id: fighter.id },
    data: {
      slug,
      name: profile.name,
      nameRu: profile.nameRu,
      nickname: profile.nickname,
      photoUrl: profile.photoUrl || rosterEntry?.rosterPhotoUrl || fighter.photoUrl || null,
      country: profile.country || fighter.country,
      weightClass: titleCase(profile.weightClass || fighter.weightClass),
      status: profile.status,
      record: profile.record || rosterEntry?.record || fighter.record,
      age: profile.age || fighter.age,
      heightCm: profile.heightCm || fighter.heightCm,
      reachCm: profile.reachCm || fighter.reachCm,
      winsByKnockout: profile.winsByKnockout,
      winsBySubmission: profile.winsBySubmission,
      winsByDecision: profile.winsByDecision,
      sigStrikesLandedPerMin: profile.sigStrikesLandedPerMin,
      strikeAccuracy: profile.strikeAccuracy,
      sigStrikesAbsorbedPerMin: profile.sigStrikesAbsorbedPerMin,
      strikeDefense: profile.strikeDefense,
      takedownAveragePer15: profile.takedownAveragePer15,
      takedownAccuracy: profile.takedownAccuracy,
      takedownDefense: profile.takedownDefense,
      submissionAveragePer15: profile.submissionAveragePer15,
      averageFightTime: profile.averageFightTime,
      team: profile.team || fighter.team,
      style: profile.style || fighter.style,
      bio: profile.bio || fighter.bio
    }
  });

  if (recentFights.length > 0) {
    await saveRecentFights(prisma, fighter.id, recentFights);
  }

  return { ok: true };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const limit = args.limit ? Number.parseInt(args.limit, 10) : null;
  const offset = args.offset ? Number.parseInt(args.offset, 10) : 0;

  const [rosterEntries, fighters] = await Promise.all([
    collectUfcRosterEntries(),
    prisma.fighter.findMany({
      where: {
        promotion: { slug: "ufc" },
        status: { in: ["active", "champion", "prospect"] }
      },
      include: {
        _count: {
          select: {
            recentFights: true
          }
        }
      },
      orderBy: { name: "asc" }
    })
  ]);

  const scopedFighters = fighters.slice(offset, limit ? offset + limit : undefined);
  const exactNameMap = new Map();
  const tokenMap = new Map();

  for (const entry of rosterEntries) {
    const exactKey = normalizeName(entry.name);
    const tokenKey = tokenSignature(entry.name);

    if (exactKey && !exactNameMap.has(exactKey)) {
      exactNameMap.set(exactKey, entry);
    }

    if (tokenKey && !tokenMap.has(tokenKey)) {
      tokenMap.set(tokenKey, entry);
    }
  }

  let repaired = 0;
  let retired = 0;
  let skipped = 0;

  for (const fighter of scopedFighters) {
    const exactEntry = exactNameMap.get(normalizeName(fighter.name));
    const tokenEntry = tokenMap.get(tokenSignature(fighter.name));
    const rosterEntry = exactEntry || tokenEntry || null;
    const targetSlug = rosterEntry?.slug || fighter.slug;
    const slugTaken =
      targetSlug !== fighter.slug
        ? await prisma.fighter.findUnique({
            where: { slug: targetSlug },
            select: { id: true }
          })
        : null;

    if (slugTaken && slugTaken.id !== fighter.id) {
      skipped += 1;
      continue;
    }

    try {
      const result = await backfillFromSlug(fighter, targetSlug, rosterEntry);
      if (result.ok) {
        repaired += 1;
        continue;
      }
    } catch {
      // fall through to retirement heuristic
    }

    if (isSevereLegacy(fighter)) {
      await prisma.fighter.update({
        where: { id: fighter.id },
        data: { status: "retired" }
      });
      retired += 1;
    } else {
      skipped += 1;
    }
  }

  console.log(JSON.stringify({ checked: scopedFighters.length, repaired, retired, skipped }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
