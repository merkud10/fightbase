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

function datesAreNear(left, right, maxDays = 2) {
  if (!left || !right) {
    return false;
  }

  const diffMs = Math.abs(new Date(left).getTime() - new Date(right).getTime());
  return diffMs <= maxDays * 24 * 60 * 60 * 1000;
}

function findCompatibleMergeKey(merged, normalizedFight) {
  const incomingOpponentBits = normalizeKeyFragment(normalizedFight.opponentName).split(" ").filter(Boolean);
  const incomingOpponentKey = incomingOpponentBits.slice(-1)[0] || normalizeKeyFragment(normalizedFight.opponentName);
  const incomingYear = normalizedFight.date ? new Date(normalizedFight.date).getUTCFullYear() : "no-date";

  for (const [key, existing] of merged.entries()) {
    const existingOpponentBits = normalizeKeyFragment(existing.opponentName).split(" ").filter(Boolean);
    const existingOpponentKey = existingOpponentBits.slice(-1)[0] || normalizeKeyFragment(existing.opponentName);
    const existingYear = existing.date ? new Date(existing.date).getUTCFullYear() : "no-date";

    if (incomingOpponentKey !== existingOpponentKey) {
      continue;
    }

    if (incomingYear !== existingYear) {
      continue;
    }

    if (datesAreNear(existing.date, normalizedFight.date)) {
      return key;
    }
  }

  return null;
}

function collapseNearbyOpponentDuplicates(fights) {
  const collapsed = [];

  for (const fight of fights) {
    const existingIndex = collapsed.findIndex((entry) => {
      const incomingOpponentBits = normalizeKeyFragment(fight.opponentName).split(" ").filter(Boolean);
      const existingOpponentBits = normalizeKeyFragment(entry.opponentName).split(" ").filter(Boolean);
      const incomingOpponentKey = incomingOpponentBits.slice(-1)[0] || normalizeKeyFragment(fight.opponentName);
      const existingOpponentKey = existingOpponentBits.slice(-1)[0] || normalizeKeyFragment(entry.opponentName);

      return incomingOpponentKey === existingOpponentKey && datesAreNear(entry.date, fight.date);
    });

    if (existingIndex === -1) {
      collapsed.push(fight);
      continue;
    }

    collapsed[existingIndex] = mergeFightRecords(collapsed[existingIndex], fight);
  }

  return collapsed;
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

function inferResultFromNotes(notes) {
  const text = String(notes || "").toLowerCase();

  if (!text) {
    return "";
  }

  if (/won|stopped|submitted|scored/i.test(text)) return "Победа";
  if (/disqualified|lost|was defeated|was stopped|was knocked out|was submitted/i.test(text)) return "Поражение";
  if (/no contest/i.test(text)) return "Несостоявшийся бой";

  return "";
}

function getFightSourceRank(fight) {
  if (String(fight.notes || "").trim()) return 3;
  if (String(fight.method || "").trim()) return 2;
  return 1;
}

function choosePreferredResult(left, right) {
  const leftFromNotes = inferResultFromNotes(left.notes);
  const rightFromNotes = inferResultFromNotes(right.notes);

  if (leftFromNotes && !rightFromNotes) return leftFromNotes;
  if (rightFromNotes && !leftFromNotes) return rightFromNotes;
  if (leftFromNotes && rightFromNotes) {
    return getFightSourceRank(right) >= getFightSourceRank(left) ? rightFromNotes : leftFromNotes;
  }

  if (!left.result) return right.result;
  if (!right.result) return left.result;
  if (left.result === right.result) return left.result;

  return getFightSourceRank(right) >= getFightSourceRank(left) ? right.result : left.result;
}

function mergeFightRecords(base, incoming) {
  return {
    opponentName: chooseBetterText(base.opponentName, incoming.opponentName),
    opponentNameRu: chooseBetterText(base.opponentNameRu, incoming.opponentNameRu),
    eventName: chooseBetterText(prettifyEventName(base.eventName), prettifyEventName(incoming.eventName)),
    result: choosePreferredResult(base, incoming),
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
      const compatibleKey = merged.has(key) ? key : findCompatibleMergeKey(merged, normalizedFight);
      const existing = compatibleKey ? merged.get(compatibleKey) : null;
      if (!existing) {
        merged.set(key, normalizedFight);
        continue;
      }

      merged.set(compatibleKey, mergeFightRecords(existing, normalizedFight));
      removedRows += 1;
    }

    const nextFights = collapseNearbyOpponentDuplicates([...merged.values()]).sort((left, right) => {
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
