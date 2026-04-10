#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");

const { fetchText, parseArgs, saveRecentFights, titleCase } = require("./fighter-import-utils");
const { persistImageLocally } = require("./local-image-store");
const { parseUfcProfile, parseUfcRecentFights } = require("./sync-ufc-roster");

const prisma = new PrismaClient();

function needsBackfill(fighter) {
  const missingVitals = !fighter.age || !fighter.heightCm || !fighter.reachCm || !fighter.team || !fighter.style;
  const missingStats =
    fighter.sigStrikesLandedPerMin == null ||
    fighter.strikeAccuracy == null ||
    fighter.sigStrikesAbsorbedPerMin == null ||
    fighter.strikeDefense == null ||
    fighter.takedownAveragePer15 == null ||
    fighter.takedownAccuracy == null ||
    fighter.takedownDefense == null ||
    fighter.submissionAveragePer15 == null ||
    !fighter.averageFightTime;
  const missingRecentFights = fighter._count.recentFights === 0;

  return missingVitals || missingStats || missingRecentFights;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const singleSlug = typeof args.slug === "string" ? String(args.slug).trim() : "";
  const limit = args.limit ? Number.parseInt(args.limit, 10) : null;
  const offset = args.offset ? Number.parseInt(args.offset, 10) : 0;
  const concurrency = args.concurrency ? Math.max(1, Number.parseInt(args.concurrency, 10)) : 6;

  const fighters = await prisma.fighter.findMany({
    where: {
      promotion: { slug: "ufc" },
      ...(singleSlug ? { slug: singleSlug } : {})
    },
    include: {
      promotion: true,
      _count: {
        select: {
          recentFights: true
        }
      }
    },
    orderBy: { name: "asc" }
  });

  const backlog = singleSlug ? fighters : fighters.filter(needsBackfill).slice(offset, limit ? offset + limit : undefined);

  let updated = 0;
  let failed = 0;
  let cursor = 0;

  console.log(`Backfilling ${backlog.length} UFC fighter profiles with concurrency ${concurrency}.`);

  async function processFighter(fighter) {
    const url = `https://www.ufc.com/athlete/${fighter.slug}`;
    const html = await fetchText(url);
    const profile = parseUfcProfile(html, fighter.slug, fighter);
    const localizedPhotoUrl = await persistImageLocally({
      bucket: "fighters",
      key: fighter.slug,
      sourceUrl: profile.photoUrl || fighter.photoUrl || null
    }).catch(() => profile.photoUrl || fighter.photoUrl || null);
    const recentFights = parseUfcRecentFights(html, fighter.slug, profile.name, titleCase(profile.weightClass || fighter.weightClass || ""));

    await prisma.fighter.update({
      where: { id: fighter.id },
      data: {
        name: profile.name,
        nameRu: profile.nameRu,
        nickname: profile.nickname,
        photoUrl: localizedPhotoUrl,
        country: profile.country || fighter.country,
        weightClass: titleCase(profile.weightClass || fighter.weightClass),
        status: profile.status,
        record: profile.record || fighter.record,
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
  }

  async function worker() {
    while (cursor < backlog.length) {
      const index = cursor;
      cursor += 1;
      const fighter = backlog[index];

      try {
        await processFighter(fighter);
        updated += 1;
        console.log(`Backfilled UFC fighter: ${fighter.name}`);
      } catch (error) {
        failed += 1;
        console.error(`Failed UFC backfill for ${fighter.slug}: ${error.message || error}`);
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
