// Склейка профилей-дублей бойца в основной профиль.
//
//   node scripts/merge-fighters.js --pairs keeper:loser,keeper2:loser2          # dry-run
//   node scripts/merge-fighters.js --pairs keeper:loser --apply                  # запись
//
// Бои, победители, пики модели, связи со статьями, закреплённые сравнения и
// история боёв переезжают на основной профиль; пустые поля основного профиля
// добираются из дубля (scripts/fighter-merge.js). Слаг дубля остаётся алиасом
// (FighterSlugAlias) — карточка и сравнения по старому адресу отдают 308.

const { PrismaClient } = require("@prisma/client");

const { planFieldMerge } = require("./fighter-merge");

const prisma = new PrismaClient();

function parsePairs(argv) {
  const index = argv.indexOf("--pairs");
  const raw = index >= 0 ? argv[index + 1] : "";
  return String(raw || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [keeper, loser] = item.split(":");
      if (!keeper || !loser || keeper === loser) throw new Error(`Bad pair: ${item}`);
      return { keeper, loser };
    });
}

function sortedPair(a, b) {
  return a < b ? [a, b] : [b, a];
}

async function mergePair(tx, keeperSlug, loserSlug, apply) {
  const keeper = await tx.fighter.findUnique({ where: { slug: keeperSlug } });
  const loser = await tx.fighter.findUnique({ where: { slug: loserSlug } });
  if (!keeper || !loser) {
    console.log(`SKIP ${keeperSlug} <- ${loserSlug}: ${!keeper ? "no keeper" : "no loser"}`);
    return;
  }

  const loserFights = await tx.fight.findMany({
    where: { OR: [{ fighterAId: loser.id }, { fighterBId: loser.id }] },
    select: { id: true, slug: true, eventId: true, fighterAId: true, fighterBId: true, status: true }
  });
  const keeperFights = await tx.fight.findMany({
    where: { OR: [{ fighterAId: keeper.id }, { fighterBId: keeper.id }] },
    select: { eventId: true, fighterAId: true, fighterBId: true }
  });
  const opponent = (fight, selfId) => (fight.fighterAId === selfId ? fight.fighterBId : fight.fighterAId);
  // Тот же бой, заведённый дважды (на дубле и на основном профиле) — копию дубля удаляем.
  const duplicateFights = loserFights.filter((fight) =>
    keeperFights.some((kf) => kf.eventId === fight.eventId && opponent(kf, keeper.id) === opponent(fight, loser.id))
  );
  const movedFights = loserFights.filter((fight) => !duplicateFights.includes(fight));
  const articleLinks = await tx.articleFighter.findMany({ where: { fighterId: loser.id }, select: { articleId: true } });
  const keeperRecent = await tx.fighterRecentFight.count({ where: { fighterId: keeper.id } });
  const loserRecent = await tx.fighterRecentFight.count({ where: { fighterId: loser.id } });
  const pins = await tx.pinnedComparePair.findMany({
    where: { OR: [{ fighterAId: loser.id }, { fighterBId: loser.id }] }
  });
  const fields = planFieldMerge(keeper, loser);

  console.log(`\n${keeperSlug} <- ${loserSlug}`);
  console.log(`  fights moved: ${movedFights.map((f) => f.slug || f.id).join(", ") || "-"}`);
  console.log(`  duplicate fights removed: ${duplicateFights.map((f) => f.slug || f.id).join(", ") || "-"}`);
  console.log(`  article links: ${articleLinks.length}, recent fights: ${loserRecent} (${keeperRecent ? "dropped, keeper has own" : "moved"}), pins: ${pins.length}`);
  console.log(`  keeper fields: ${JSON.stringify(fields)}`);

  if (!apply) return;

  if (duplicateFights.length > 0) {
    await tx.fight.deleteMany({ where: { id: { in: duplicateFights.map((f) => f.id) } } });
  }
  await tx.fight.updateMany({ where: { fighterAId: loser.id }, data: { fighterAId: keeper.id } });
  await tx.fight.updateMany({ where: { fighterBId: loser.id }, data: { fighterBId: keeper.id } });
  await tx.fight.updateMany({ where: { winnerFighterId: loser.id }, data: { winnerFighterId: keeper.id } });
  // Пик считается действительным, пока совпадает с одним из бойцов боя: без
  // этой замены генератор счёл бы пик устаревшим и выбрал заново.
  await tx.fightPredictionSnapshot.updateMany({ where: { aiPickFighterId: loser.id }, data: { aiPickFighterId: keeper.id } });

  if (articleLinks.length > 0) {
    await tx.articleFighter.createMany({
      data: articleLinks.map((link) => ({ articleId: link.articleId, fighterId: keeper.id })),
      skipDuplicates: true
    });
    await tx.articleFighter.deleteMany({ where: { fighterId: loser.id } });
  }

  if (keeperRecent === 0) {
    await tx.fighterRecentFight.updateMany({ where: { fighterId: loser.id }, data: { fighterId: keeper.id } });
  }

  for (const pin of pins) {
    await tx.pinnedComparePair.delete({ where: { fighterAId_fighterBId: { fighterAId: pin.fighterAId, fighterBId: pin.fighterBId } } });
    const other = pin.fighterAId === loser.id ? pin.fighterBId : pin.fighterAId;
    if (other === keeper.id) continue;
    const [fighterAId, fighterBId] = sortedPair(keeper.id, other);
    await tx.pinnedComparePair.upsert({
      where: { fighterAId_fighterBId: { fighterAId, fighterBId } },
      create: { fighterAId, fighterBId, reason: pin.reason },
      update: {}
    });
  }

  await tx.fighterSlugAlias.updateMany({ where: { fighterId: loser.id }, data: { fighterId: keeper.id } });
  await tx.fighterSlugAlias.upsert({
    where: { slug: loser.slug },
    create: { slug: loser.slug, fighterId: keeper.id },
    update: { fighterId: keeper.id }
  });

  // espnId уникален: сначала снимаем с дубля, потом отдаём основному профилю.
  if (fields.espnId) {
    await tx.fighter.update({ where: { id: loser.id }, data: { espnId: null } });
  }
  if (Object.keys(fields).length > 0) {
    await tx.fighter.update({ where: { id: keeper.id }, data: fields });
  }
  await tx.fighter.delete({ where: { id: loser.id } });
  console.log("  merged");
}

async function main() {
  const pairs = parsePairs(process.argv);
  const apply = process.argv.includes("--apply");
  if (pairs.length === 0) throw new Error("Usage: --pairs keeper:loser[,keeper:loser] [--apply]");

  console.log(apply ? "APPLY" : "DRY RUN (add --apply to write)");
  for (const { keeper, loser } of pairs) {
    await prisma.$transaction((tx) => mergePair(tx, keeper, loser, apply), { timeout: 60_000 });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
