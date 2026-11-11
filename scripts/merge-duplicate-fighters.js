#!/usr/bin/env node

// Склейка пустых дублей бойцов, у которых есть бои и прогнозы (ноябрь 2026).
// Бои дубля переходят на полный профиль, старый адрес карточки уводится на него
// через FighterSlugAlias (страница бойца отдаёт постоянный редирект), дубль
// удаляется. Правила — в fighter-merge-plan.js.
//
// По умолчанию dry-run: печатает план и ничего не пишет. Запись только с --apply.
// Одну пару можно выбрать через --only <слаг дубля>.

const { PrismaClient } = require("@prisma/client");

const { planFighterMerge } = require("./fighter-merge-plan");

const prisma = new PrismaClient();

const PAIRS = [
  { duplicate: "gabriel-lorenco", canonical: "gabriel-lourenco", espnId: "5215710" },
  { duplicate: "jose-souza", canonical: "jose-henrique", espnId: "5080485" }
];

const apply = process.argv.includes("--apply");
const onlyIndex = process.argv.indexOf("--only");
const only = onlyIndex >= 0 ? process.argv[onlyIndex + 1] : null;

const fighterSelect = {
  id: true,
  slug: true,
  name: true,
  nameRu: true,
  espnId: true,
  record: true,
  photoUrl: true,
  weightClass: true,
  articleMap: { select: { articleId: true } },
  _count: { select: { recentFights: true, pinnedPairsA: true, pinnedPairsB: true, slugAliases: true } }
};

async function loadFights(fighterId) {
  const fights = await prisma.fight.findMany({
    where: { OR: [{ fighterAId: fighterId }, { fighterBId: fighterId }] },
    select: {
      id: true,
      slug: true,
      eventId: true,
      status: true,
      resultType: true,
      winnerFighterId: true,
      method: true,
      resultRound: true,
      resultTime: true,
      fighterAId: true,
      fighterBId: true,
      event: { select: { slug: true, date: true } },
      predictionSnapshot: { select: { id: true, aiPickFighterId: true } }
    }
  });
  return fights.map((fight) => ({ ...fight, hasPrediction: Boolean(fight.predictionSnapshot) }));
}

function describeFight(fight) {
  return {
    id: fight.id,
    slug: fight.slug,
    event: fight.event.slug,
    date: fight.event.date.toISOString().slice(0, 10),
    status: fight.status,
    result: fight.status === "completed" ? `${fight.resultType ?? "?"} ${fight.method ?? ""} R${fight.resultRound ?? "?"}`.trim() : null,
    hasPrediction: fight.hasPrediction
  };
}

function describeFighter(fighter, fights) {
  return {
    slug: fighter.slug,
    name: fighter.name,
    nameRu: fighter.nameRu,
    espnId: fighter.espnId,
    record: fighter.record,
    weightClass: fighter.weightClass,
    hasPhoto: Boolean(fighter.photoUrl),
    articles: fighter.articleMap.length,
    recentFights: fighter._count.recentFights,
    pinnedPairs: fighter._count.pinnedPairsA + fighter._count.pinnedPairsB,
    fights: fights.map(describeFight)
  };
}

async function applyMerge(pair, duplicate, canonical, plan, duplicateFights) {
  const fightsById = new Map(duplicateFights.map((fight) => [fight.id, fight]));
  const swap = (fighterId) => (fighterId === duplicate.id ? canonical.id : fighterId);

  await prisma.$transaction(async (tx) => {
    for (const action of plan.actions) {
      if (action.type === "drop") {
        await tx.fight.delete({ where: { id: action.fightId } });
        continue;
      }

      const fight = fightsById.get(action.fightId);
      if (action.type === "absorb") {
        await tx.fight.delete({ where: { id: action.deleteFightId } });
      }
      await tx.fight.update({
        where: { id: fight.id },
        data: {
          fighterAId: swap(fight.fighterAId),
          fighterBId: swap(fight.fighterBId),
          winnerFighterId: fight.winnerFighterId ? swap(fight.winnerFighterId) : fight.winnerFighterId,
          ...(action.result ?? {})
        }
      });
      // Пик модели хранит id бойца: без переноса он указывал бы на удалённую запись.
      await tx.fightPredictionSnapshot.updateMany({
        where: { fightId: fight.id, aiPickFighterId: duplicate.id },
        data: { aiPickFighterId: canonical.id }
      });
    }

    const canonicalArticles = new Set(canonical.articleMap.map((row) => row.articleId));
    const articlesToMove = duplicate.articleMap.map((row) => row.articleId).filter((articleId) => !canonicalArticles.has(articleId));
    if (articlesToMove.length > 0) {
      await tx.articleFighter.createMany({
        data: articlesToMove.map((articleId) => ({ articleId, fighterId: canonical.id })),
        skipDuplicates: true
      });
    }

    // Адреса, которые уже вели на дубль, и его собственный адрес — на полный профиль.
    await tx.fighterSlugAlias.updateMany({ where: { fighterId: duplicate.id }, data: { fighterId: canonical.id } });
    await tx.fighterSlugAlias.upsert({
      where: { slug: duplicate.slug },
      create: { slug: duplicate.slug, fighterId: canonical.id },
      update: { fighterId: canonical.id }
    });

    // articleMap, recentFights и закреплённые пары дубля уходят каскадом.
    await tx.fighter.delete({ where: { id: duplicate.id } });
    if (plan.setEspnId) {
      await tx.fighter.update({ where: { id: canonical.id }, data: { espnId: plan.setEspnId } });
    }
  });
}

async function main() {
  const report = [];

  for (const pair of PAIRS.filter((item) => !only || item.duplicate === only)) {
    const [duplicate, canonical] = await Promise.all([
      prisma.fighter.findUnique({ where: { slug: pair.duplicate }, select: fighterSelect }),
      prisma.fighter.findUnique({ where: { slug: pair.canonical }, select: fighterSelect })
    ]);
    const duplicateFights = duplicate ? await loadFights(duplicate.id) : [];
    const canonicalFights = canonical ? await loadFights(canonical.id) : [];
    const plan = planFighterMerge({ duplicate, canonical, duplicateFights, canonicalFights, expectedEspnId: pair.espnId });

    const entry = {
      pair: `${pair.duplicate} -> ${pair.canonical}`,
      duplicate: duplicate ? describeFighter(duplicate, duplicateFights) : null,
      canonical: canonical ? describeFighter(canonical, canonicalFights) : null,
      plan
    };

    if (apply && plan.ok) {
      await applyMerge(pair, duplicate, canonical, plan, duplicateFights);
      entry.applied = true;
    }
    report.push(entry);
  }

  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", report }, null, 1));
  if (apply && report.some((entry) => !entry.plan.ok)) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
