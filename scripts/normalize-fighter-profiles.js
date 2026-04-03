#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const opponentTranslations = {
  "Brad Wheeler": "Р‘СЂСЌРґ РЈРёР»РµСЂ",
  "Sean O'Malley": "РЁРѕРЅ Рћ'РњСЌР»Р»Рё"
};

const methodMap = new Map([
  ["Soumission (Г©tranglement arriГЁre)", "РЎР°Р±РјРёС€РµРЅ (СѓРґСѓС€РµРЅРёРµ СЃР·Р°РґРё)"],
  ["Soumission (clГ© de talon)", "РЎР°Р±РјРёС€РµРЅ (СЃРєСЂСѓС‡РёРІР°РЅРёРµ РїСЏС‚РєРё)"],
  ["TKO (СѓРґР°СЂС‹ and Р»РѕРєС‚Рё)", "TKO (СѓРґР°СЂС‹ Рё Р»РѕРєС‚Рё)"],
  ["TKO (СѓРґР°СЂС‹ and soccer kicks)", "TKO (СѓРґР°СЂС‹ Рё СЃРѕРєРєРµСЂ-РєРёРєРё)"]
]);

const noteReplacements = [
  [/Won the UFC Light Heavyweight Championship \./g, "Р—Р°РІРѕРµРІР°Р» С‚РёС‚СѓР» С‡РµРјРїРёРѕРЅР° UFC РІ РїРѕР»СѓС‚СЏР¶РµР»РѕРј РІРµСЃРµ."],
  [/Lost the UFC Light Heavyweight Championship \./g, "РџРѕС‚РµСЂСЏР» С‚РёС‚СѓР» С‡РµРјРїРёРѕРЅР° UFC РІ РїРѕР»СѓС‚СЏР¶РµР»РѕРј РІРµСЃРµ."],
  [/Defended the UFC Light Heavyweight Championship \./g, "Р—Р°С‰РёС‚РёР» С‚РёС‚СѓР» С‡РµРјРїРёРѕРЅР° UFC РІ РїРѕР»СѓС‚СЏР¶РµР»РѕРј РІРµСЃРµ."],
  [/Won the UFC Welterweight Championship \./g, "Р—Р°РІРѕРµРІР°Р» С‚РёС‚СѓР» С‡РµРјРїРёРѕРЅР° UFC РІ РїРѕР»СѓСЃСЂРµРґРЅРµРј РІРµСЃРµ."],
  [/Defended the UFC Lightweight Championship \./g, "Р—Р°С‰РёС‚РёР» С‚РёС‚СѓР» С‡РµРјРїРёРѕРЅР° UFC РІ Р»РµРіРєРѕРј РІРµСЃРµ."],
  [/Won the UFC Lightweight Championship \./g, "Р—Р°РІРѕРµРІР°Р» С‚РёС‚СѓР» С‡РµРјРїРёРѕРЅР° UFC РІ Р»РµРіРєРѕРј РІРµСЃРµ."],
  [/Won the UFC Featherweight Championship \./g, "Р—Р°РІРѕРµРІР°Р» С‚РёС‚СѓР» С‡РµРјРїРёРѕРЅР° UFC РІ РїРѕР»СѓР»РµРіРєРѕРј РІРµСЃРµ."],
  [/Defended the UFC Featherweight Championship \./g, "Р—Р°С‰РёС‚РёР» С‚РёС‚СѓР» С‡РµРјРїРёРѕРЅР° UFC РІ РїРѕР»СѓР»РµРіРєРѕРј РІРµСЃРµ."],
  [/Won the vacant UFC Lightweight Championship \./g, "Р—Р°РІРѕРµРІР°Р» РІР°РєР°РЅС‚РЅС‹Р№ С‚РёС‚СѓР» С‡РµРјРїРёРѕРЅР° UFC РІ Р»РµРіРєРѕРј РІРµСЃРµ."],
  [/Won the interim UFC Heavyweight Championship \./g, "Р—Р°РІРѕРµРІР°Р» РІСЂРµРјРµРЅРЅС‹Р№ С‚РёС‚СѓР» С‡РµРјРїРёРѕРЅР° UFC РІ С‚СЏР¶РµР»РѕРј РІРµСЃРµ."],
  [/Performance of the Night\./g, "РџРѕР»СѓС‡РёР» Р±РѕРЅСѓСЃ В«Р’С‹СЃС‚СѓРїР»РµРЅРёРµ РІРµС‡РµСЂР°В»."],
  [/Fight of the Night\./g, "РџРѕР»СѓС‡РёР» Р±РѕРЅСѓСЃ В«Р‘РѕР№ РІРµС‡РµСЂР°В»."],
  [/Welterweight debut\./g, "Р”РµР±СЋС‚ РІ РїРѕР»СѓСЃСЂРµРґРЅРµРј РІРµСЃРµ."],
  [/Middleweight debut\./g, "Р”РµР±СЋС‚ РІ СЃСЂРµРґРЅРµРј РІРµСЃРµ."],
  [/Featherweight debut\./g, "Р”РµР±СЋС‚ РІ РїРѕР»СѓР»РµРіРєРѕРј РІРµСЃРµ."],
  [/Lightweight debut\./g, "Р”РµР±СЋС‚ РІ Р»РµРіРєРѕРј РІРµСЃРµ."],
  [/Tied for the longest win streak in UFC history \(16\)\./g, "РџРѕРІС‚РѕСЂРёР» РѕРґРёРЅ РёР· Р»СѓС‡С€РёС… РїРѕР±РµРґРЅС‹С… РѕС‚СЂРµР·РєРѕРІ РІ РёСЃС‚РѕСЂРёРё UFC."],
  [/Broke the record for the most consecutive UFC Lightweight title defenses \(4\)\./g, "РЈСЃС‚Р°РЅРѕРІРёР» СЂРµРєРѕСЂРґ РґРёРІРёР·РёРѕРЅР° РїРѕ СѓСЃРїРµС€РЅС‹Рј Р·Р°С‰РёС‚Р°Рј С‚РёС‚СѓР»Р°."],
  [/Later vacated the title on 28 June 2025\./g, "РџРѕР·РґРЅРµРµ РѕСЃРІРѕР±РѕРґРёР» С‚РёС‚СѓР»."],
  [/DГ©but en poids moyen\./g, "Р”РµР±СЋС‚ РІ СЃСЂРµРґРЅРµРј РІРµСЃРµ."],
  [/Devient le champion des poids moyens de l'ARES Fighting Championship\./g, "Р—Р°РІРѕРµРІР°Р» С‚РёС‚СѓР» С‡РµРјРїРёРѕРЅР° ARES FC РІ СЃСЂРµРґРЅРµРј РІРµСЃРµ."],
  [/Soumission de la soirГ©e/g, "РџРѕР»СѓС‡РёР» Р±РѕРЅСѓСЃ Р·Р° Р»СѓС‡С€РёР№ СЃР°Р±РјРёС€РµРЅ РІРµС‡РµСЂР°."],
  [/Combat en poids intermГ©diaire Г  180 lb \(82 kg \)\./g, "Р‘РѕР№ РїСЂРѕС€РµР» РІ РїСЂРѕРјРµР¶СѓС‚РѕС‡РЅРѕРј РІРµСЃРµ."]
];

function normalizeWhitespace(value) {
  return value
    .replace(/\s+\./g, ".")
    .replace(/\s+,/g, ",")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeNotes(value, fallbackResult) {
  if (!value) {
    return fallbackResult === "РџРѕР±РµРґР°"
      ? "РџРѕР±РµРґР° РІ РїРѕСЃР»РµРґРЅРµРј Р·Р°С„РёРєСЃРёСЂРѕРІР°РЅРЅРѕРј Р±РѕСЋ."
      : fallbackResult === "РџРѕСЂР°Р¶РµРЅРёРµ"
        ? "РџРѕСЂР°Р¶РµРЅРёРµ РІ РїРѕСЃР»РµРґРЅРµРј Р·Р°С„РёРєСЃРёСЂРѕРІР°РЅРЅРѕРј Р±РѕСЋ."
        : fallbackResult === "РќРµСЃРѕСЃС‚РѕСЏРІС€РёР№СЃСЏ Р±РѕР№"
          ? "Р‘РѕР№ Р±С‹Р» РїСЂРёР·РЅР°РЅ РЅРµСЃРѕСЃС‚РѕСЏРІС€РёРјСЃСЏ."
          : null;
  }

  let next = value;
  for (const [pattern, replacement] of noteReplacements) {
    next = next.replace(pattern, replacement);
  }

  next = normalizeWhitespace(next);
  next = next
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(". ");

  if (!next) {
    return null;
  }

  if (!next.endsWith(".")) {
    next += ".";
  }

  return next;
}

async function main() {
  const fights = await prisma.fighterRecentFight.findMany({
    orderBy: [{ fighterId: "asc" }, { date: "desc" }]
  });

  for (const fight of fights) {
    const nextMethod = methodMap.get(fight.method || "") || fight.method;
    const nextOpponentNameRu = opponentTranslations[fight.opponentName] || fight.opponentNameRu || null;
    const nextNotes = normalizeNotes(fight.notes, fight.result);

    await prisma.fighterRecentFight.update({
      where: { id: fight.id },
      data: {
        opponentNameRu: nextOpponentNameRu,
        method: nextMethod,
        notes: nextNotes
      }
    });
  }

  console.log(`Normalized ${fights.length} recent fight rows.`);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
