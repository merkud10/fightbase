// Возвращает бою предматчевую линию, если её затёрли коэффициенты по ходу
// поединка (см. scripts/odds-freeze.js), и пересчитывает поля прогноза, которые
// выводятся из линии: проценты, фаворита, метку уверенности и английский
// шаблонный текст. Тексты и пик модели, кэфы на момент пика не трогает.
//
//   node scripts/repair-prefight-line.js --fight <slug> --oddsA 3.93 --oddsB 1.25 --at 2026-11-14T20:07:32Z          # dry-run
//   node scripts/repair-prefight-line.js --fight <slug> --oddsA 3.93 --oddsB 1.25 --at 2026-11-14T20:07:32Z --apply

const { PrismaClient } = require("@prisma/client");

const { buildSnapshotCopy, normalizeRuSnapshot } = require("./generate-prediction-snapshots");

const prisma = new PrismaClient();

function readArg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const slug = String(readArg("fight") || "").trim();
  const oddsA = Number(readArg("oddsA"));
  const oddsB = Number(readArg("oddsB"));
  const at = new Date(String(readArg("at") || ""));
  const apply = process.argv.includes("--apply");
  if (!slug || !(oddsA > 1) || !(oddsB > 1) || Number.isNaN(at.getTime())) {
    throw new Error("Usage: --fight <slug> --oddsA <decimal> --oddsB <decimal> --at <ISO time of the line> [--apply]");
  }

  const recentFights = { orderBy: { date: "desc" }, take: 3 };
  const fight = await prisma.fight.findUnique({
    where: { slug },
    include: {
      event: { include: { promotion: true } },
      fighterA: { include: { recentFights } },
      fighterB: { include: { recentFights } },
      predictionSnapshot: { select: { percentA: true, percentB: true, pickRu: true, confidenceLabelRu: true } }
    }
  });
  if (!fight) throw new Error(`Fight not found: ${slug}`);
  if (!fight.predictionSnapshot) throw new Error(`Fight has no prediction snapshot: ${slug}`);

  const restored = { ...fight, oddsA, oddsB };
  const ru = normalizeRuSnapshot(buildSnapshotCopy("ru", restored));
  const en = buildSnapshotCopy("en", restored);
  const before = fight.predictionSnapshot;

  console.log(apply ? "APPLY" : "DRY RUN (add --apply to write)");
  console.log(`${fight.fighterA.name} vs ${fight.fighterB.name}`);
  console.log(`  line: ${fight.oddsA} / ${fight.oddsB} -> ${oddsA} / ${oddsB} (as of ${at.toISOString()})`);
  console.log(`  percent: ${before.percentA}/${before.percentB} -> ${ru.percentA}/${ru.percentB}`);
  console.log(`  favourite: ${before.pickRu} (${before.confidenceLabelRu}) -> ${ru.pick} (${ru.confidenceLabel})`);
  console.log(`  overview (en): ${en.overview}`);
  if (!apply) return;

  await prisma.$transaction([
    prisma.fight.update({ where: { id: fight.id }, data: { oddsA, oddsB, oddsUpdatedAt: at } }),
    prisma.fightPredictionSnapshot.update({
      where: { fightId: fight.id },
      data: {
        percentA: ru.percentA,
        percentB: ru.percentB,
        source: ru.source,
        sourceOddsUpdatedAt: at,
        pickRu: ru.pick,
        pickEn: en.pick,
        confidenceLabelRu: ru.confidenceLabel,
        confidenceLabelEn: en.confidenceLabel,
        excerptEn: en.excerpt,
        overviewEn: en.overview,
        keyEdgeEn: en.keyEdge,
        fightScriptEn: en.fightScript
      }
    })
  ]);
  console.log("  written");
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
