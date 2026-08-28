#!/usr/bin/env node

// Считает, сколько профилей бойцов испорчено, по четырём независимым признакам:
// дубли одного боя, конфликт исхода внутри дубля, латиница в русском имени
// соперника и расхождение bio с record/weightClass. Только читает.

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeOpponent(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^by\s+/, "")
    .replace(/[^a-zа-яё0-9]+/gi, " ")
    .trim();
}

// Русское имя, в котором осталась латиница, — след недоведённой транслитерации
// («Дарион Аббеи Уит Стрикес» и подобное приезжает именно так).
function hasLatin(value) {
  return /[A-Za-z]{3,}/.test(String(value || ""));
}

function parseRecordWins(record) {
  const match = String(record || "").match(/^\s*(\d+)\s*-\s*(\d+)/);
  if (!match) {
    return null;
  }

  return { wins: Number(match[1]), losses: Number(match[2]) };
}

// В bio рекорд встречается и цифрами («13-3-0»), и прописью («0 побед и 1 поражение»).
function extractBioRecord(bio) {
  const text = String(bio || "");

  const numeric = text.match(/\b(\d+)\s*-\s*(\d+)(?:\s*-\s*\d+)?\b/);
  if (numeric) {
    return { wins: Number(numeric[1]), losses: Number(numeric[2]) };
  }

  const verbose = text.match(/(\d+)\s+побед\S*\s+и\s+(\d+)\s+поражени\S*/i);
  if (verbose) {
    return { wins: Number(verbose[1]), losses: Number(verbose[2]) };
  }

  return null;
}

const WEIGHT_CLASS_RU = {
  Flyweight: "наилегч",
  Bantamweight: "легчайш",
  Featherweight: "полулегк",
  Lightweight: "легк",
  Welterweight: "полусредн",
  Middleweight: "средн",
  "Light Heavyweight": "полутяж",
  Heavyweight: "тяж",
  "Women's Strawweight": "минимальн",
  "Women's Flyweight": "наилегч",
  "Women's Bantamweight": "легчайш",
  "Women's Featherweight": "полулегк"
};

// «полутяжелый» содержит «тяж», «полулегкий» содержит «легк» — поэтому проверяем
// не вхождение ожидаемого корня, а какой из корней в bio самый длинный.
function detectBioWeightClass(bio) {
  const text = String(bio || "").toLowerCase();
  const stems = [...new Set(Object.values(WEIGHT_CLASS_RU))].sort((a, b) => b.length - a.length);
  return stems.find((stem) => text.includes(`${stem}`)) ?? null;
}

function auditFighter(fighter) {
  const issues = [];
  const fights = fighter.recentFights;

  // Дубли: один соперник, даты в пределах суток. Сравниваем попарно —
  // истории короткие, квадратичность здесь дешевле группировки по ключу,
  // который из-за сдвига даты всё равно не совпадёт.
  const duplicatePairs = [];
  for (let i = 0; i < fights.length; i += 1) {
    for (let j = i + 1; j < fights.length; j += 1) {
      const a = fights[i];
      const b = fights[j];
      if (normalizeOpponent(a.opponentName) !== normalizeOpponent(b.opponentName)) {
        continue;
      }
      if (Math.abs(a.date.getTime() - b.date.getTime()) > DAY_MS) {
        continue;
      }
      duplicatePairs.push([a, b]);
    }
  }

  if (duplicatePairs.length > 0) {
    issues.push("duplicateFights");
  }

  const conflicting = duplicatePairs.filter(([a, b]) => a.result !== b.result);
  if (conflicting.length > 0) {
    issues.push("conflictingResults");
  }

  if (fights.some((fight) => hasLatin(fight.opponentNameRu))) {
    issues.push("latinInOpponentNameRu");
  }

  const record = parseRecordWins(fighter.record);
  const bioRecord = extractBioRecord(fighter.bio);
  const recordMismatch = Boolean(
    record && bioRecord && (record.wins !== bioRecord.wins || record.losses !== bioRecord.losses)
  );
  if (recordMismatch) {
    issues.push("bioRecordMismatch");
  }

  const expectedStem = WEIGHT_CLASS_RU[fighter.weightClass];
  const bioStem = detectBioWeightClass(fighter.bio);
  const weightMismatch = Boolean(expectedStem && bioStem && bioStem !== expectedStem);
  if (weightMismatch) {
    issues.push("bioWeightClassMismatch");
  }

  return {
    slug: fighter.slug,
    issues,
    duplicateCount: duplicatePairs.length,
    conflictingCount: conflicting.length,
    sample: {
      conflicting: conflicting.slice(0, 2).map(([a, b]) => ({
        opponent: a.opponentName,
        a: { date: a.date.toISOString().slice(0, 10), result: a.result, round: a.round, event: a.eventName },
        b: { date: b.date.toISOString().slice(0, 10), result: b.result, round: b.round, event: b.eventName }
      })),
      latinNames: fights
        .filter((fight) => hasLatin(fight.opponentNameRu))
        .slice(0, 3)
        .map((fight) => fight.opponentNameRu),
      record: recordMismatch ? { field: fighter.record, bio: bioRecord } : null,
      weightClass: weightMismatch ? { field: fighter.weightClass, bioStem } : null
    }
  };
}

async function main() {
  const fighters = await prisma.fighter.findMany({
    where: { promotion: { slug: "ufc" } },
    select: {
      slug: true,
      record: true,
      weightClass: true,
      bio: true,
      recentFights: {
        select: { opponentName: true, opponentNameRu: true, eventName: true, result: true, date: true, round: true }
      }
    }
  });

  const audited = fighters.map(auditFighter);
  const affected = audited.filter((entry) => entry.issues.length > 0);

  const byIssue = {};
  for (const entry of affected) {
    for (const issue of entry.issues) {
      byIssue[issue] = (byIssue[issue] ?? 0) + 1;
    }
  }

  // Профили с историей боёв считаем отдельно: у пустых половина проверок
  // неприменима, и они разбавляют долю.
  const withHistory = audited.filter((entry, index) => fighters[index].recentFights.length > 0);

  console.log(
    JSON.stringify(
      {
        totalFighters: fighters.length,
        fightersWithHistory: withHistory.length,
        affectedFighters: affected.length,
        affectedShare: `${((affected.length / fighters.length) * 100).toFixed(1)}%`,
        byIssue,
        duplicateFightRows: affected.reduce((sum, entry) => sum + entry.duplicateCount, 0),
        conflictingFightRows: affected.reduce((sum, entry) => sum + entry.conflictingCount, 0),
        samples: affected.slice(0, 15)
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
