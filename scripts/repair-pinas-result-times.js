// Verified against UFC athlete history and ESPN scoreboard on 2026-11-01.
// Dry-run by default; only the two verified resultTime values may change.
const fs = require("node:fs");
const repairs = [
  { id: "cmszonieb000be9w7xucdakyf", slug: "damian-pinas-vs-andrey-pulyaev", opponent: "andrey-pulyaev", event: "ufc-332-silva-vs-wang", before: "3:45", after: "1:15" },
  { id: "cmp9d8tk3000fe9jql6goohrq", slug: "damian-pinas-vs-cesar-almeida", opponent: "cesar-almeida", event: "ufc-329-mcgregor-vs-holloway-2", before: "0:16", after: "4:44" }
];

function validateRepair(fight, repair) {
  if (!fight || fight.id !== repair.id || fight.slug !== repair.slug
    || fight.event.slug !== repair.event || fight.fighterA.slug !== "damian-pinas"
    || fight.fighterB.slug !== repair.opponent || fight.status !== "completed"
    || fight.resultType !== "win" || fight.winnerFighterId !== fight.fighterAId
    || fight.resultRound !== 1 || fight.method !== "KO/TKO") throw new Error("Unexpected fight state");
  if (fight.resultTime === repair.after) return "already-correct";
  if (fight.resultTime !== repair.before) throw new Error("Unexpected previous time");
  return "repair";
}

async function main() {
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  const include = { event: { select: { slug: true } }, fighterA: { select: { slug: true } }, fighterB: { select: { slug: true } } };
  try {
    const plans = [];
    for (const repair of repairs) {
      const before = await prisma.fight.findUnique({ where: { id: repair.id }, include });
      plans.push({ repair, before, action: validateRepair(before, repair) });
    }
    console.log(JSON.stringify(plans.map(({ repair, action }) => ({ ...repair, action }))));
    const pending = plans.filter((plan) => plan.action === "repair");
    if (!process.argv.includes("--apply") || !pending.length) return;
    const backupPath = `tmp-pinas-times-before-${Date.now()}.json`;
    fs.writeFileSync(backupPath, JSON.stringify(plans, null, 2), { flag: "wx", mode: 0o600 });
    await prisma.$transaction(async (tx) => {
      for (const { repair, before } of pending) {
        const current = await tx.fight.findUnique({ where: { id: repair.id }, include });
        if (validateRepair(current, repair) !== "repair") throw new Error("Fight changed; aborted");
        const result = await tx.fight.updateMany({
          where: { id: repair.id, updatedAt: before.updatedAt, resultTime: repair.before },
          data: { resultTime: repair.after }
        });
        if (result.count !== 1) throw new Error("Concurrent update; aborted");
      }
    });
    console.log(JSON.stringify({ updated: pending.length, backupPath }));
  } finally { await prisma.$disconnect(); }
}

module.exports = { repairs, validateRepair };
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
