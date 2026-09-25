// Подтягивает фразу о рекорде в русской биографии к текущему рекорду бойца
// (scripts/bio-record.js). Биография пишется один раз, а рекорд синки
// обновляют после каждого боя — без этого текст расходится с шапкой карточки.
//
//   node scripts/sync-bio-records.js            # сухой прогон
//   node scripts/sync-bio-records.js --apply    # запись
//
// Ежедневный крон: cron-tasks.sh sync-bio-records. Английские биографии не
// трогаем: в них рекорд почти не встречается, а шаблон цеплял адреса клубов.

const { PrismaClient } = require("@prisma/client");

const { syncBioRecord } = require("./bio-record");

const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes("--apply");
  const fighters = await prisma.fighter.findMany({ select: { id: true, slug: true, record: true, bio: true } });
  const changes = fighters
    .map((fighter) => ({ ...fighter, nextBio: syncBioRecord(fighter.bio, fighter.record, "ru") }))
    .filter((fighter) => fighter.nextBio !== fighter.bio);

  for (const fighter of changes.slice(0, apply ? 0 : 10)) {
    console.log(`[would update] ${fighter.slug} (${fighter.record})`);
  }

  if (apply) {
    for (const fighter of changes) {
      await prisma.fighter.update({ where: { id: fighter.id }, data: { bio: fighter.nextBio } });
    }
  }

  console.log(JSON.stringify({ checked: fighters.length, updated: apply ? changes.length : 0, planned: changes.length }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
