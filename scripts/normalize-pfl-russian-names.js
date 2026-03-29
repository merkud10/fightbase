#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");

const { transliterateName } = require("./fighter-import-utils");

const prisma = new PrismaClient();

const overrideMap = {
  "AJ McKee": "Эй Джей Макки",
  "Ariane Lipski da Silva": "Ариане Липски да Силва",
  "Asaël Adjoudj": "Асаэль Аджудж",
  "Biaggio Ali Walsh": "Бьяджо Али Уолш",
  "Caolan Loughran": "Кейлан Локран",
  "Cédric Doumbé": "Седрик Думбе",
  "Chequina Noso Pedro": "Чекина Носо Педро",
  "Ciara McGuirk": "Кира Макгирк",
  "Islam Youssef": "Ислам Юссеф",
  "Mélèdje Yedoh": "Меледж Йедо",
  "Sergey Bilostenniy": "Сергей Белостенный",
  "Shadrack Yemba": "Шадрак Йемба",
  "Taylor Lapilus": "Тейлор Лапилус",
  "Tomasz Łangowski": "Томаш Ланговский",
  "Yabna N’tchala": "Ябна Нтчала"
};

function deaccent(value) {
  return String(value || "")
    .replace(/[’']/g, "'")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/gi, "l")
    .replace(/æ/gi, "ae")
    .replace(/œ/gi, "oe")
    .replace(/ß/g, "ss");
}

function cleanupRussianName(value) {
  return String(value || "")
    .replace(/Да Силва/g, "да Силва")
    .replace(/Мк/gi, "Мак")
    .replace(/Ёу/g, "Ю")
    .replace(/Ием/g, "Йем")
    .replace(/кк /g, "к ")
    .replace(/Асаел/g, "Асаэль")
    .replace(/Томасз/g, "Томаш")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizePflRussianName(name, currentNameRu) {
  const cleanName = String(name || "").trim();
  if (!cleanName) {
    return currentNameRu || "";
  }

  if (overrideMap[cleanName]) {
    return overrideMap[cleanName];
  }

  const normalizedSource = deaccent(cleanName);
  const generated = transliterateName(normalizedSource);
  return cleanupRussianName(generated);
}

async function main() {
  const fighters = await prisma.fighter.findMany({
    where: {
      promotion: {
        slug: "pfl"
      }
    },
    select: {
      id: true,
      name: true,
      nameRu: true
    }
  });

  let updated = 0;

  for (const fighter of fighters) {
    const nextNameRu = normalizePflRussianName(fighter.name, fighter.nameRu);
    if (nextNameRu && nextNameRu !== fighter.nameRu) {
      await prisma.fighter.update({
        where: { id: fighter.id },
        data: { nameRu: nextNameRu }
      });
      updated += 1;
    }
  }

  console.log(`Normalized ${updated} PFL Russian names.`);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
