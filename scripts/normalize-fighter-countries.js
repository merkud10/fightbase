// Перевод стран бойцов, записанных латиницей («USA», «Myanmar»…), на русский по
// словарю normalizeCountry. Синки с 27.10.2026 пишут страну уже по-русски, а
// этот скрипт один раз чинит то, что лежало в базе до расширения словаря.
//
//   node scripts/normalize-fighter-countries.js           # dry-run: что поменяется
//   node scripts/normalize-fighter-countries.js --apply   # запись

const { PrismaClient } = require("@prisma/client");

const { normalizeCountry } = require("./fighter-import-utils");

const prisma = new PrismaClient();
const LATIN_START = /^[A-Za-z]/;

async function main() {
  const apply = process.argv.includes("--apply");
  const fighters = await prisma.fighter.findMany({ select: { id: true, country: true } });
  const changes = new Map();
  const untouched = new Map();

  for (const fighter of fighters) {
    if (!LATIN_START.test(fighter.country || "")) continue;
    const next = normalizeCountry(fighter.country);
    const bucket = next !== fighter.country ? changes : untouched;
    const key = next !== fighter.country ? `${fighter.country} -> ${next}` : fighter.country;
    if (!bucket.has(key)) bucket.set(key, []);
    bucket.get(key).push(fighter.id);
  }

  for (const [key, ids] of [...changes].sort((a, b) => b[1].length - a[1].length)) console.log(`${ids.length}\t${key}`);
  if (untouched.size > 0) console.log(`Без перевода в словаре: ${[...untouched.keys()].join(", ")}`);
  const total = [...changes.values()].reduce((sum, ids) => sum + ids.length, 0);
  console.log(`${apply ? "Обновляю" : "Dry-run, поменялось бы"}: ${total} бойцов, ${changes.size} стран`);

  if (!apply) return;
  for (const [key, ids] of changes) {
    const next = key.split(" -> ")[1];
    await prisma.fighter.updateMany({ where: { id: { in: ids } }, data: { country: next } });
  }
  console.log("Готово");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
