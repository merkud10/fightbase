#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const nameDictionary = require("../lib/ufc-name-dictionary.json");

const slugOverrides = {
  "ufc-vegas-115": {
    title: "Превью прелимов UFC Vegas 115",
    excerpt:
      "Прелимы UFC Vegas 115 в Лас-Вегасе дают несколько интригующих матчапов. Кратко разбираем предварительный кард и бои, за которыми стоит следить особенно внимательно."
  }
};

const genericStringReplacements = [
  ["Предпоказ:", "Превью:"],
  ["Предпоказ ", "Превью "],
  ["Предварительный обзор:", "Превью:"],
  ["Ultimate Fighting Championship", "UFC"],
  ["Ренато Карнейро", "Ренато Мойкано"],
  ["Крис Дансон", "Крис Дункан"],
  ["Криса Дансона", "Криса Дункана"],
  ["Дансон", "Дункан"],
  ["Карнейро", "Мойкано"],
  ["Мойяно", "Мойкано"],
  ["UFC Апекс 115", "UFC Vegas 115"],
  ["UFC Апексе 115", "UFC Vegas 115"],
  ["UFC Fight Night 272", "UFC Vegas 115"],
  ["UFC Fight Night 115", "UFC Vegas 115"],
  ["Fight Night 272", "UFC Vegas 115"],
  ["Meta Apex", "Meta APEX"],
  ["Мета Апексе", "Meta APEX"],
  ["восьмираундового", "трехраундового"],
  ["пятибойный", "пятибоевой"],
  ["вечеpини", "вечера"],
  ["бамбата-вейт", "легчайший вес"],
  ["в легчайший вес дивизионе", "в дивизионе легчайшего веса"],
  ["бойцовая червь", "боец"],
  ["предстоящий выездной турне", "предстоящую выездную серию турниров"],
  ["эквивалент уборки в холодильнике перед отпуском", "последний домашний турнир перед выездной серией UFC"]
];

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeWhitespace(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function applyNameDictionary(value) {
  let next = String(value || "");

  for (const [english, russian] of Object.entries(nameDictionary.fullNames || {})) {
    next = next.replace(new RegExp(`\\b${escapeRegExp(english)}\\b`, "g"), russian);
  }

  for (const [wrong, correct] of Object.entries(nameDictionary.ruCorrections || {})) {
    next = next.replace(new RegExp(`\\b${escapeRegExp(wrong)}\\b`, "g"), correct);
  }

  return next;
}

function cleanAnalysisText(value) {
  let next = applyNameDictionary(value);

  for (const [from, to] of genericStringReplacements) {
    next = next.split(from).join(to);
  }

  next = next
    .replace(/^Предпоказ:\s*/gi, "Превью: ")
    .replace(/^Предварительный обзор:\s*/gi, "Превью: ")
    .replace(/Ultimate Fighting Championship/gi, "UFC")
    .replace(/предстоящий выездной турне/gi, "предстоящую выездную серию турниров")
    .replace(/эквивалент уборки в холодильнике перед отпуском/gi, "последний домашний турнир перед выездной серией UFC")
    .replace(/UFC Apex/gi, "Meta APEX");

  return normalizeWhitespace(next);
}

async function main() {
  const articles = await prisma.article.findMany({
    where: { category: "analysis" },
    include: { sections: { orderBy: { sortOrder: "asc" } } }
  });

  let updatedArticles = 0;
  let updatedSections = 0;

  for (const article of articles) {
    const override = slugOverrides[article.slug] || null;
    const nextTitle = override?.title || cleanAnalysisText(article.title);
    const nextExcerpt = override?.excerpt || cleanAnalysisText(article.excerpt || "");

    if (nextTitle !== article.title || nextExcerpt !== (article.excerpt || "")) {
      await prisma.article.update({
        where: { id: article.id },
        data: {
          title: nextTitle,
          excerpt: nextExcerpt
        }
      });
      updatedArticles += 1;
    }

    for (const section of article.sections) {
      const nextBody = cleanAnalysisText(section.body);
      if (nextBody !== section.body) {
        await prisma.articleSection.update({
          where: { id: section.id },
          data: { body: nextBody }
        });
        updatedSections += 1;
      }
    }
  }

  console.log(JSON.stringify({ updatedArticles, updatedSections }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
