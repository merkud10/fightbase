#!/usr/bin/env node
// Русское имя и биография для бойцов ближайших турниров, у которых их нет.
// ESPN-синки (sync-roster-upcoming, фото из Sherdog) дают рекорд, рост и фото, но
// nameRu и bio не трогают, а ufc.ru с прода отвечает 403. Новичок, заявленный за
// неделю до турнира, оставался с английским именем в заголовке ровно тогда, когда
// его ищут («франсиско прадо боец»: CTR 7% в Google, конкурентов в выдаче нет).
//
//   node scripts/localize-upcoming-fighters.js                    # сухой прогон
//   node scripts/localize-upcoming-fighters.js --apply            # запись
//   node scripts/localize-upcoming-fighters.js --days-forward 30 --fighter-slug javad-mahjoub
//
// Порядок для имени: ручной словарь → ИИ (если прошло проверку) → транслитерация.
// Биография: ИИ по данным профиля → шаблон buildGenericBio. Заполненные поля не
// перезаписываем. Ежедневный крон: cron-tasks.sh localize-upcoming.

const { PrismaClient } = require("@prisma/client");

const {
  buildGenericBio,
  getManualRussianName,
  localizeUfcFighterProfileWithDeepSeek,
  parseArgs,
  transliterateName
} = require("./fighter-import-utils");
const { isAcceptableRussianBio, isAcceptableRussianName } = require("./fighter-ru-profile");

const prisma = new PrismaClient();

function isPlaceholder(slug) {
  return String(slug || "")
    .split("-")
    .some((part) => part === "tba" || part === "tbd");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apply = Boolean(args.apply);
  const daysForward = Number.parseInt(args["days-forward"] || "21", 10);
  const until = new Date(Date.now() + daysForward * 86_400_000);

  const fights = await prisma.fight.findMany({
    where: { event: { status: "upcoming", date: { lte: until } } },
    select: {
      fighterA: true,
      fighterB: true
    }
  });
  const fighters = new Map();
  for (const fight of fights) {
    for (const fighter of [fight.fighterA, fight.fighterB]) {
      if (!fighter || isPlaceholder(fighter.slug)) continue;
      if (args["fighter-slug"] && fighter.slug !== args["fighter-slug"]) continue;
      if (fighter.nameRu && String(fighter.bio || "").trim()) continue;
      fighters.set(fighter.id, fighter);
    }
  }

  const results = [];
  for (const fighter of fighters.values()) {
    let ai = null;
    try {
      ai = await localizeUfcFighterProfileWithDeepSeek({
        name: fighter.name,
        nickname: fighter.nickname,
        country: fighter.country,
        weightClass: fighter.weightClass,
        status: fighter.status,
        record: fighter.record,
        team: fighter.team,
        style: fighter.style,
        highlights: "",
        description: ""
      });
    } catch (error) {
      console.error(`[ai failed] ${fighter.slug}: ${error.message || error}`);
    }

    const nameRu =
      fighter.nameRu ||
      getManualRussianName(fighter.name) ||
      (ai && isAcceptableRussianName(ai.nameRu, fighter.name) ? ai.nameRu : null) ||
      transliterateName(fighter.name);
    const nameSource = fighter.nameRu
      ? "kept"
      : getManualRussianName(fighter.name)
        ? "manual"
        : ai && ai.nameRu === nameRu
          ? "ai"
          : "translit";

    let bio = String(fighter.bio || "").trim();
    let bioSource = "kept";
    if (!bio) {
      if (ai && isAcceptableRussianBio(ai.bioRu, nameRu)) {
        bio = ai.bioRu;
        bioSource = "ai";
      } else {
        bio = buildGenericBio({
          nameRu,
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
        });
        bioSource = "template";
      }
    }

    results.push({ slug: fighter.slug, name: fighter.name, nameRu, nameSource, bioSource });
    console.log(`[${apply ? "update" : "would update"}] ${fighter.slug}: ${fighter.name} → ${nameRu} (${nameSource}), bio ${bioSource}`);
    if (!apply) {
      console.log(`    ${bio.slice(0, 220)}`);
    }

    if (apply) {
      await prisma.fighter.update({
        where: { id: fighter.id },
        data: { nameRu, bio }
      });
    }
  }

  console.log(
    JSON.stringify({
      checked: fighters.size,
      updated: apply ? results.length : 0,
      ai: results.filter((item) => item.nameSource === "ai").length,
      translit: results.filter((item) => item.nameSource === "translit").length,
      templateBio: results.filter((item) => item.bioSource === "template").length
    })
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
