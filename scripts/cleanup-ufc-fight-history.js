#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");

const { saveRecentFights, transliterateName } = require("./fighter-import-utils");

const prisma = new PrismaClient();

function prettifyEventName(value) {
  return String(value || "")
    .replace(/-/g, " ")
    .replace(/\bUfc\b/gi, "UFC")
    .replace(/\bEspn\b/gi, "ESPN")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMethod(value, notes) {
  const source = String(value || "").trim();
  const noteText = String(notes || "").trim();
  const combined = `${source} ${noteText}`.trim().toLowerCase();

  if (/unanimous decision/.test(combined)) return "Decision - Unanimous";
  if (/split decision/.test(combined)) return "Decision - Split";
  if (/majority decision/.test(combined)) return "Decision - Majority";
  if (/ko\/tko/.test(combined)) return "KO/TKO";
  if (/submission/.test(combined) || /submiss/i.test(combined)) return "Submission";
  if (/strikes/.test(combined)) return "Strikes";

  return source || null;
}

function deriveRound(value, notes) {
  if (value) {
    return value;
  }

  const text = String(notes || "").toLowerCase();
  const explicit = text.match(/(?:first|second|third|fourth|fifth)\s+round/);
  if (explicit) {
    const map = {
      first: 1,
      second: 2,
      third: 3,
      fourth: 4,
      fifth: 5
    };
    return map[explicit[0].split(" ")[0]] || null;
  }

  if (/five round/.test(text) && /decision/.test(text)) return 5;
  if (/three round/.test(text) && /decision/.test(text)) return 3;

  return null;
}

function deriveTime(value, notes) {
  if (value) {
    return value;
  }

  const text = String(notes || "");
  const explicit = text.match(/at\s+(\d:\d{2})/i);
  if (explicit) {
    return explicit[1];
  }

  if (/decision/i.test(text)) {
    return "5:00";
  }

  return null;
}

function normalizeKeyFragment(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim();
}

function buildMergeKey(fight) {
  const eventKey = normalizeKeyFragment(prettifyEventName(fight.eventName));
  const opponentBits = normalizeKeyFragment(fight.opponentName).split(" ").filter(Boolean);
  const opponentKey = opponentBits.slice(-1)[0] || normalizeKeyFragment(fight.opponentName);
  const date = fight.date ? new Date(fight.date) : null;
  const year = date ? date.getUTCFullYear() : "no-date";
  return `${year}:${eventKey}:${opponentKey}`;
}

function chooseBetterText(left, right) {
  const a = String(left || "").trim();
  const b = String(right || "").trim();
  return b.length > a.length ? b : a;
}

function chooseBetterDate(left, right) {
  if (!left) return right;
  if (!right) return left;
  return new Date(right).getTime() > new Date(left).getTime() ? right : left;
}

function mergeFightRecords(base, incoming) {
  return {
    opponentName: chooseBetterText(base.opponentName, incoming.opponentName),
    opponentNameRu: chooseBetterText(base.opponentNameRu, incoming.opponentNameRu),
    eventName: chooseBetterText(prettifyEventName(base.eventName), prettifyEventName(incoming.eventName)),
    result: base.result || incoming.result,
    method: normalizeMethod(base.method, base.notes) || normalizeMethod(incoming.method, incoming.notes),
    date: chooseBetterDate(base.date, incoming.date),
    round: base.round || deriveRound(incoming.round, incoming.notes) || deriveRound(base.round, base.notes),
    time: base.time || deriveTime(incoming.time, incoming.notes) || deriveTime(base.time, base.notes),
    weightClass: base.weightClass || incoming.weightClass || null,
    notes: chooseBetterText(base.notes, incoming.notes)
  };
}

async function main() {
  const ufc = await prisma.promotion.findUnique({
    where: { slug: "ufc" },
    include: {
      fighters: {
        include: {
          recentFights: {
            orderBy: { date: "desc" }
          }
        }
      }
    }
  });

  if (!ufc) {
    throw new Error("UFC promotion not found");
  }

  let updatedFighters = 0;
  let removedRows = 0;

  for (const fighter of ufc.fighters) {
    if (fighter.recentFights.length === 0) {
      continue;
    }

    const normalizedFighterName = fighter.name.trim().toLowerCase();
    const normalizedFighterNameRu = (fighter.nameRu || "").trim().toLowerCase();
    const merged = new Map();

    for (const fight of fighter.recentFights) {
      const opponentName = String(fight.opponentName || "").trim();
      const opponentNameRu = String(fight.opponentNameRu || "").trim();
      if (
        opponentName.toLowerCase() === normalizedFighterName ||
        (normalizedFighterNameRu && opponentNameRu.toLowerCase() === normalizedFighterNameRu)
      ) {
        removedRows += 1;
        continue;
      }

      const normalizedFight = {
        opponentName,
        opponentNameRu: opponentNameRu || transliterateName(opponentName),
        eventName: prettifyEventName(fight.eventName),
        result: fight.result,
        method: normalizeMethod(fight.method, fight.notes),
        date: fight.date,
        round: deriveRound(fight.round, fight.notes),
        time: deriveTime(fight.time, fight.notes),
        weightClass: fight.weightClass,
        notes: fight.notes
      };

      const key = buildMergeKey(normalizedFight);
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, normalizedFight);
        continue;
      }

      merged.set(key, mergeFightRecords(existing, normalizedFight));
      removedRows += 1;
    }

    const nextFights = [...merged.values()].sort((left, right) => {
      const leftTime = left.date ? new Date(left.date).getTime() : 0;
      const rightTime = right.date ? new Date(right.date).getTime() : 0;
      return rightTime - leftTime;
    });

    await saveRecentFights(prisma, fighter.id, nextFights);
    updatedFighters += 1;
  }

  console.log(
    JSON.stringify(
      {
        updatedFighters,
        removedRows
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
