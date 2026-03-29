#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const opponentTranslations = {
  "Brad Wheeler": "Брэд Уилер",
  "Sean O'Malley": "Шон О'Мэлли"
};

const methodMap = new Map([
  ["Soumission (étranglement arrière)", "Сабмишен (удушение сзади)"],
  ["Soumission (clé de talon)", "Сабмишен (скручивание пятки)"],
  ["TKO (удары and локти)", "TKO (удары и локти)"],
  ["TKO (удары and soccer kicks)", "TKO (удары и соккер-кики)"]
]);

const noteReplacements = [
  [/Won the UFC Light Heavyweight Championship \./g, "Завоевал титул чемпиона UFC в полутяжелом весе."],
  [/Lost the UFC Light Heavyweight Championship \./g, "Потерял титул чемпиона UFC в полутяжелом весе."],
  [/Defended the UFC Light Heavyweight Championship \./g, "Защитил титул чемпиона UFC в полутяжелом весе."],
  [/Won the UFC Welterweight Championship \./g, "Завоевал титул чемпиона UFC в полусреднем весе."],
  [/Defended the UFC Lightweight Championship \./g, "Защитил титул чемпиона UFC в легком весе."],
  [/Won the UFC Lightweight Championship \./g, "Завоевал титул чемпиона UFC в легком весе."],
  [/Won the UFC Featherweight Championship \./g, "Завоевал титул чемпиона UFC в полулегком весе."],
  [/Defended the UFC Featherweight Championship \./g, "Защитил титул чемпиона UFC в полулегком весе."],
  [/Won the vacant UFC Lightweight Championship \./g, "Завоевал вакантный титул чемпиона UFC в легком весе."],
  [/Won the interim UFC Heavyweight Championship \./g, "Завоевал временный титул чемпиона UFC в тяжелом весе."],
  [/Lost the PFL Middleweight Championship \./g, "Потерял титул чемпиона PFL в среднем весе."],
  [/Won the first PFL Lightweight Championship\./g, "Завоевал первый титул чемпиона PFL в легком весе."],
  [/Won the 2024 PFL Women's Flyweight Tournament \./g, "Выиграла женский гран-при PFL 2024 в наилегчайшем весе."],
  [/Performance of the Night\./g, "Получил бонус «Выступление вечера»."],
  [/Fight of the Night\./g, "Получил бонус «Бой вечера»."],
  [/Welterweight debut\./g, "Дебют в полусреднем весе."],
  [/Middleweight debut\./g, "Дебют в среднем весе."],
  [/Featherweight debut\./g, "Дебют в полулегком весе."],
  [/Lightweight debut\./g, "Дебют в легком весе."],
  [/Tied for the longest win streak in UFC history \(16\)\./g, "Повторил один из лучших победных отрезков в истории UFC."],
  [/Broke the record for the most consecutive UFC Lightweight title defenses \(4\)\./g, "Установил рекорд дивизиона по успешным защитам титула."],
  [/Later vacated the title on 28 June 2025\./g, "Позднее освободил титул."],
  [/Début en poids moyen\./g, "Дебют в среднем весе."],
  [/Devient le champion des poids moyens de l'ARES Fighting Championship\./g, "Завоевал титул чемпиона ARES FC в среднем весе."],
  [/Soumission de la soirée/g, "Получил бонус за лучший сабмишен вечера."],
  [/Combat en poids intermédiaire à 180 lb \(82 kg \)\./g, "Бой прошел в промежуточном весе."]
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
    return fallbackResult === "Победа"
      ? "Победа в последнем зафиксированном бою."
      : fallbackResult === "Поражение"
        ? "Поражение в последнем зафиксированном бою."
        : fallbackResult === "Несостоявшийся бой"
          ? "Бой был признан несостоявшимся."
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
