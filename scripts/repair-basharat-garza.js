// One verified correction, dry-run by default. Sources and rollback fields:
// docs/audits/2026-10-31/basharat-garza.md
const fs = require("node:fs");
const path = require("node:path");

const FIGHT_ID = "cmrbo56z20001e902k53vk3x1";
const OLD_SLUG = "farid-basharat-vs-pablo-garza";
const NEW_SLUG = "farid-basharat-vs-john-garza";
const EVENT_SLUG = "ufc-329-mcgregor-vs-holloway-2";

function validateFight(fight) {
  if (!fight || fight.id !== FIGHT_ID || fight.event.slug !== EVENT_SLUG
      || fight.fighterA.slug !== "farid-basharat" || fight.status !== "completed"
      || fight.winnerFighterId !== fight.fighterAId || fight.predictionSnapshot) {
    throw new Error("Unexpected fight state; no changes allowed");
  }
  if (fight.slug === NEW_SLUG && fight.fighterB.slug === "john-garza" && fight.fighterB.name === "John Garza") return "already-correct";
  if (fight.slug !== OLD_SLUG || fight.fighterB.slug !== "pablo-garza" || fight.fighterB.name !== "Pablo Garza") {
    throw new Error("Unexpected opponent or slug; no changes allowed");
  }
  return "repair";
}

const johnProfile = {
  slug: "john-garza", name: "John Garza", nameRu: "Джон Гарза", nickname: "Mowgli",
  country: "США", weightClass: "Bantamweight", status: "active", record: "6-2-0",
  age: 23, heightCm: 173, reachCm: 0, team: "Aztex MMA", style: "Striker",
  bio: "Джон Гарза — американский боец легчайшего веса из Далласа, тренирующийся в Aztex MMA. В июле 2026 года дебютировал в UFC против Фарида Башарата и уступил единогласным решением после трёх раундов.",
  bioEn: "John Garza is an American bantamweight from Dallas who trains at Aztex MMA. He made his UFC debut against Farid Basharat in July 2026, losing by unanimous decision after three rounds."
};

async function main() {
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  const include = { event: true, fighterA: true, fighterB: true, predictionSnapshot: true };
  try {
    const before = await prisma.fight.findUnique({ where: { id: FIGHT_ID }, include });
    const action = validateFight(before);
    const existing = await prisma.fighter.findUnique({ where: { slug: johnProfile.slug } });
    if (existing && (existing.name !== johnProfile.name || existing.promotionId !== before.fighterA.promotionId)) {
      throw new Error("John Garza profile conflicts with verified identity");
    }
    console.log(JSON.stringify({ action, apply: process.argv.includes("--apply"), fightId: FIGHT_ID,
      previousOpponent: before.fighterB.name, nextOpponent: johnProfile.name, createProfile: !existing }));
    if (action === "already-correct" || !process.argv.includes("--apply")) return;

    const backupPath = path.resolve(`tmp-basharat-garza-before-${Date.now()}.json`);
    fs.writeFileSync(backupPath, JSON.stringify({ before, existingJohn: existing }, null, 2), { flag: "wx", mode: 0o600 });
    await prisma.$transaction(async (tx) => {
      const current = await tx.fight.findUnique({ where: { id: FIGHT_ID }, include });
      if (validateFight(current) !== "repair" || current.updatedAt.getTime() !== before.updatedAt.getTime()) {
        throw new Error("Fight changed since read; transaction aborted");
      }
      const john = existing ?? await tx.fighter.create({ data: { ...johnProfile, promotionId: before.fighterA.promotionId } });
      const changed = await tx.fight.updateMany({
        where: { id: FIGHT_ID, updatedAt: before.updatedAt, fighterBId: before.fighterBId, slug: OLD_SLUG },
        data: { fighterBId: john.id, slug: NEW_SLUG }
      });
      if (changed.count !== 1) throw new Error("Concurrent fight update; transaction aborted");
      if (!existing) {
        await tx.fighterRecentFight.create({ data: {
          fighterId: john.id, opponentName: "Farid Basharat", opponentNameRu: "Фарид Башарат",
          eventName: before.event.name, date: before.event.date, result: "Поражение",
          method: "Decision - Unanimous", round: 3, time: "5:00", weightClass: "Bantamweight",
          notes: "Verified 2026-10-31: https://www.ufc.com/event/ufc-329#12940"
        } });
      }
    });
    const after = await prisma.fight.findUnique({ where: { id: FIGHT_ID }, include });
    if (validateFight(after) !== "already-correct") throw new Error("Readback failed");
    console.log(JSON.stringify({ result: "corrected", backupPath, slug: after.slug, opponent: after.fighterB.name }));
  } finally {
    await prisma.$disconnect();
  }
}

module.exports = { validateFight, FIGHT_ID, OLD_SLUG, NEW_SLUG, EVENT_SLUG };
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
