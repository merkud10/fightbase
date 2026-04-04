#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");
const { getPreferredRussianName, transliterateName } = require("./fighter-import-utils");
const ufcNameDictionary = require("../lib/ufc-name-dictionary.json");

const prisma = new PrismaClient();

function cleanOpponentName(value) {
  return String(value || "")
    .replace(/^\s*by\s+/i, "")
    .trim();
}

function cleanMethod(value) {
  return String(value || "")
    .replace(/^via\s+/i, "")
    .trim();
}

function detectResultFromNotes(value) {
  const note = String(value || "").trim();
  if (!note) {
    return null;
  }

  if (/\b(won|submitted|stopped)\b/i.test(note) && !/\bwas submitted\b/i.test(note) && !/\bwas stopped\b/i.test(note)) {
    return "Победа";
  }

  if (/\b(lost|was submitted|was stopped|was knocked out)\b/i.test(note)) {
    return "Поражение";
  }

  if (/\bno contest\b/i.test(note)) {
    return "Несостоявшийся бой";
  }

  return null;
}

function normalizeFightPersonKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim();
}

function normalizeMethod(value) {
  const method = cleanMethod(value);
  if (!method) {
    return "";
  }

  const lower = method
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (
    /decision\s*unanimous|three round unanimous decision|three unanimous decision|thee round unanimous decision|third round unanimous decision|two round unanimous decision|five round unanimous decision/.test(
      lower
    )
  ) {
    return "единогласное решение";
  }

  if (/decision\s*split|three round split decision|three split decision|five round split decision/.test(lower)) {
    return "раздельное решение";
  }

  if (/decision\s*majority|majority decision/.test(lower)) {
    return "решение большинства";
  }

  if (/technical split decision|three round technical split decision/.test(lower)) {
    return "техническое раздельное решение";
  }

  if (/technical unanimous decision|three round technical unanimous decision|three round unanimous technical decision/.test(lower)) {
    return "техническое единогласное решение";
  }

  if (/technical decision|three round technical decision/.test(lower)) {
    return "техническое решение";
  }

  if (/close three round decision/.test(lower)) {
    return "решение судей";
  }

  if (/unaniomus/.test(lower)) {
    return "единогласное решение";
  }

  if (/submission due to injury/.test(lower)) {
    return "сабмишен из-за травмы";
  }

  if (/^submission$/.test(lower)) {
    return "сабмишен";
  }

  if (/doctor'?s? stoppage|doctor stoppage/.test(lower)) {
    return "TKO (остановка врачом)";
  }

  if (/ko\/tko|strikes/.test(lower)) {
    return "TKO/удары";
  }

  if (/disqualification/.test(lower)) {
    return "дисквалификация";
  }

  if (/armbar/.test(lower)) {
    return "рычаг локтя";
  }

  if (/triangle choke/.test(lower)) {
    return "треугольник";
  }

  if (/rear naked choe|rear naked choke/.test(lower)) {
    return "удушение сзади";
  }

  if (/guillotine choke/.test(lower)) {
    return "гильотина";
  }

  if (/kimura/.test(lower)) {
    return "кимура";
  }

  if (/kneebar/.test(lower)) {
    return "рычаг колена";
  }

  if (/ezekiel choke/.test(lower)) {
    return "удушение Иезекииля";
  }

  if (/forearm choke/.test(lower)) {
    return "удушение предплечьем";
  }

  return method;
}

function normalizeOpponentRussianName(value) {
  let next = String(value || "").trim();
  if (!next) {
    return "";
  }

  for (const [wrongValue, correctValue] of Object.entries(ufcNameDictionary.ruCorrections || {})) {
    if (next.includes(wrongValue)) {
      next = next.split(wrongValue).join(correctValue);
    }
  }

  return next;
}

function isSelfOpponent(fight) {
  const opponent = normalizeFightPersonKey(fight.opponentName);
  const fighterName = normalizeFightPersonKey(fight.fighter?.name);
  const fighterSlug = normalizeFightPersonKey(String(fight.fighter?.slug || "").replace(/-/g, " "));
  const fighterLastName = fighterName.split(" ").filter(Boolean).slice(-1)[0] || "";

  return Boolean(
    opponent &&
      (opponent === fighterName || opponent === fighterSlug || (fighterLastName && opponent === fighterLastName))
  );
}

function choosePreferredFight(left, right) {
  const score = (fight) => {
    let total = 0;
    if (fight.notes) total += 3;
    if (fight.method) total += 2;
    if (fight.round) total += 1;
    if (fight.time) total += 1;
    if (fight.opponentNameRu) total += 1;
    if ((fight.opponentName || "").includes(" ")) total += 2;
    return total;
  };

  return score(right) > score(left) ? right : left;
}

function buildSurnameMap(fighters) {
  const map = new Map();

  for (const fighter of fighters) {
    const surname = String(fighter.name || "").split(/\s+/).filter(Boolean).at(-1);
    if (!surname) {
      continue;
    }

    const key = normalizeFightPersonKey(surname);
    const items = map.get(key) || [];
    items.push(fighter);
    map.set(key, items);
  }

  return map;
}

function buildEventDateKey(eventName, date) {
  const dateKey = date ? new Date(date).toISOString().slice(0, 10) : "no-date";
  return `${normalizeFightPersonKey(eventName)}:${dateKey}`;
}

function buildFightPersonIndex(fighters) {
  const index = new Map();

  for (const fighter of fighters) {
    const keys = [
      normalizeFightPersonKey(fighter.name),
      normalizeFightPersonKey(String(fighter.slug || "").replace(/-/g, " ")),
      normalizeFightPersonKey(String(fighter.name || "").split(/\s+/).filter(Boolean).at(-1))
    ].filter(Boolean);

    for (const key of keys) {
      const items = index.get(key) || [];
      items.push(fighter);
      index.set(key, items);
    }
  }

  return index;
}

function buildFightPairIndex(fights) {
  const index = new Map();

  for (const fight of fights) {
    const eventKey = buildEventDateKey(fight.event?.name, fight.event?.date);
    const pairEntries = [
      { fighter: fight.fighterA, opponent: fight.fighterB },
      { fighter: fight.fighterB, opponent: fight.fighterA }
    ];

    for (const entry of pairEntries) {
      const fighterKeys = [
        normalizeFightPersonKey(entry.fighter?.name),
        normalizeFightPersonKey(String(entry.fighter?.slug || "").replace(/-/g, " ")),
        normalizeFightPersonKey(String(entry.fighter?.name || "").split(/\s+/).filter(Boolean).at(-1))
      ].filter(Boolean);
      const opponentKeys = [
        normalizeFightPersonKey(entry.opponent?.name),
        normalizeFightPersonKey(String(entry.opponent?.slug || "").replace(/-/g, " ")),
        normalizeFightPersonKey(String(entry.opponent?.name || "").split(/\s+/).filter(Boolean).at(-1))
      ].filter(Boolean);

      for (const fighterKey of fighterKeys) {
        for (const opponentKey of opponentKeys) {
          index.set(`${eventKey}:${fighterKey}:${opponentKey}`, entry.opponent);
        }
      }
    }
  }

  return index;
}

function resolveOpponentByFightCard(fight, nextOpponentName, fightPairIndex) {
  const eventKey = buildEventDateKey(fight.eventName, fight.date);
  const fighterKeys = [
    normalizeFightPersonKey(fight.fighter?.name),
    normalizeFightPersonKey(String(fight.fighter?.slug || "").replace(/-/g, " ")),
    normalizeFightPersonKey(String(fight.fighter?.name || "").split(/\s+/).filter(Boolean).at(-1))
  ].filter(Boolean);
  const opponentKey = normalizeFightPersonKey(nextOpponentName);

  for (const fighterKey of fighterKeys) {
    const match = fightPairIndex.get(`${eventKey}:${fighterKey}:${opponentKey}`);
    if (match) {
      return match;
    }
  }

  return null;
}

function resolveOpponentByReciprocalEntry(fight, nextOpponentName, eventGroups, fighterIndex) {
  const eventKey = buildEventDateKey(fight.eventName, fight.date);
  const group = eventGroups.get(eventKey) || [];
  const opponentKey = normalizeFightPersonKey(nextOpponentName);
  const fighterKeys = new Set(
    [
      normalizeFightPersonKey(fight.fighter?.name),
      normalizeFightPersonKey(String(fight.fighter?.slug || "").replace(/-/g, " ")),
      normalizeFightPersonKey(String(fight.fighter?.name || "").split(/\s+/).filter(Boolean).at(-1))
    ].filter(Boolean)
  );
  const matches = [];

  for (const candidate of group) {
    if (candidate.id === fight.id || candidate.fighterId === fight.fighterId) {
      continue;
    }

    const candidateFighterKeys = [
      normalizeFightPersonKey(candidate.fighter?.name),
      normalizeFightPersonKey(String(candidate.fighter?.slug || "").replace(/-/g, " ")),
      normalizeFightPersonKey(String(candidate.fighter?.name || "").split(/\s+/).filter(Boolean).at(-1))
    ].filter(Boolean);

    if (!candidateFighterKeys.includes(opponentKey)) {
      continue;
    }

    const candidateOpponentKey = normalizeFightPersonKey(candidate.opponentName);
    if (!candidateOpponentKey || !fighterKeys.has(candidateOpponentKey)) {
      continue;
    }

    const exactFighters = fighterIndex.get(normalizeFightPersonKey(candidate.fighter?.name)) || [];
    const exactMatch = exactFighters.find((item) => item.id === candidate.fighterId);
    if (exactMatch) {
      matches.push(exactMatch);
    }
  }

  if (matches.length !== 1) {
    return null;
  }

  return matches[0];
}

function resolveOpponentName(fight, nextOpponentName, surnameMap, eventGroups, fighterIndex, fightPairIndex) {
  const key = normalizeFightPersonKey(nextOpponentName);
  if (!key || key.includes(" ")) {
    return null;
  }

  const pairMatch = resolveOpponentByFightCard(fight, nextOpponentName, fightPairIndex);
  if (pairMatch) {
    return pairMatch;
  }

  const reciprocalMatch = resolveOpponentByReciprocalEntry(fight, nextOpponentName, eventGroups, fighterIndex);
  if (reciprocalMatch) {
    return reciprocalMatch;
  }

  const matches = surnameMap.get(key) || [];
  if (matches.length !== 1) {
    return null;
  }

  return matches[0];
}

async function main() {
  const [fighters, fights, scheduledFights] = await Promise.all([
    prisma.fighter.findMany({
      where: {
        promotion: {
          slug: "ufc"
        }
      },
      select: {
        id: true,
        slug: true,
        name: true,
        nameRu: true
      }
    }),
    prisma.fighterRecentFight.findMany({
      where: {
        fighter: {
          promotion: {
            slug: "ufc"
          }
        }
      },
      include: {
        fighter: {
          select: {
            name: true,
            slug: true
          }
        }
      }
    }),
    prisma.fight.findMany({
      where: {
        event: {
          promotion: {
            slug: "ufc"
          }
        }
      },
      include: {
        event: {
          select: {
            name: true,
            date: true
          }
        },
        fighterA: {
          select: {
            id: true,
            name: true,
            nameRu: true,
            slug: true
          }
        },
        fighterB: {
          select: {
            id: true,
            name: true,
            nameRu: true,
            slug: true
          }
        }
      }
    })
  ]);

  const surnameMap = buildSurnameMap(fighters);
  const fighterIndex = buildFightPersonIndex(fighters);
  const fightPairIndex = buildFightPairIndex(scheduledFights);
  const eventGroups = new Map();
  let updated = 0;
  let deleted = 0;
  const fightsToDelete = new Set();
  const dedupeMap = new Map();

  for (const fight of fights) {
    const eventKey = buildEventDateKey(fight.eventName, fight.date);
    const items = eventGroups.get(eventKey) || [];
    items.push(fight);
    eventGroups.set(eventKey, items);
  }

  for (const fight of fights) {
    if (isSelfOpponent(fight)) {
      fightsToDelete.add(fight.id);
      continue;
    }

    let nextOpponentName = cleanOpponentName(fight.opponentName);
    let nextOpponentNameRu = String(fight.opponentNameRu || "").trim();
    const nextMethod = normalizeMethod(fight.method);
    const nextNotes = typeof fight.notes === "string" ? fight.notes.replace(/\s+/g, " ").trim() : fight.notes;
    const nextResult = detectResultFromNotes(nextNotes) || fight.result;
    const exactOpponentRu = ufcNameDictionary.fullNames?.[nextOpponentName];

    const resolvedOpponent = resolveOpponentName(
      fight,
      nextOpponentName,
      surnameMap,
      eventGroups,
      fighterIndex,
      fightPairIndex
    );

    if (resolvedOpponent) {
      nextOpponentName = resolvedOpponent.name;
      nextOpponentNameRu =
        ufcNameDictionary.fullNames?.[resolvedOpponent.name] ||
        getPreferredRussianName(resolvedOpponent.name, resolvedOpponent.nameRu) || transliterateName(resolvedOpponent.name);
    } else if (exactOpponentRu) {
      nextOpponentNameRu = exactOpponentRu;
    } else if (!nextOpponentNameRu) {
      nextOpponentNameRu = transliterateName(nextOpponentName);
    }

    nextOpponentNameRu = normalizeOpponentRussianName(nextOpponentNameRu);

    if (
      nextOpponentName !== fight.opponentName ||
      nextOpponentNameRu !== (fight.opponentNameRu || "") ||
      nextMethod !== (fight.method || "") ||
      nextNotes !== fight.notes ||
      nextResult !== fight.result
    ) {
      await prisma.fighterRecentFight.update({
        where: { id: fight.id },
        data: {
          opponentName: nextOpponentName,
          opponentNameRu: nextOpponentNameRu || null,
          method: nextMethod || null,
          notes: nextNotes || null,
          result: nextResult
        }
      });
      updated += 1;
    }

    const dateKey = fight.date ? new Date(fight.date).toISOString().slice(0, 10) : "no-date";
    const eventKey = normalizeFightPersonKey(fight.eventName);
    const opponentKey = normalizeFightPersonKey(nextOpponentName);
    const dedupeKey = `${fight.fighterId}:${dateKey}:${eventKey}:${opponentKey}`;
    const existingFight = dedupeMap.get(dedupeKey);

    if (existingFight) {
      const preferred = choosePreferredFight(existingFight, {
        ...fight,
        opponentName: nextOpponentName,
        opponentNameRu: nextOpponentNameRu,
        method: nextMethod,
        notes: nextNotes
      });
      const removed = preferred.id === existingFight.id ? fight : existingFight;
      fightsToDelete.add(removed.id);
      dedupeMap.set(dedupeKey, preferred);
      continue;
    }

    dedupeMap.set(dedupeKey, {
      ...fight,
      opponentName: nextOpponentName,
      opponentNameRu: nextOpponentNameRu,
      method: nextMethod,
      notes: nextNotes
    });
  }

  for (const fightId of fightsToDelete) {
    await prisma.fighterRecentFight.delete({
      where: { id: fightId }
    });
    deleted += 1;
  }

  console.log(JSON.stringify({ checked: fights.length, updated, deleted }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
