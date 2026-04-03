#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const nameDictionary = require("../lib/ufc-name-dictionary.json");

const slugOverrides = {
  "ufc-vegas-115": {
    title: "Превью прелимов UFC Vegas 115",
    excerpt:
      "Прелимы UFC Vegas 115 в Лас-Вегасе дают несколько интригующих матчапов. Кратко разбираем предварительный кард и бои, за которыми стоит следить особенно внимательно."
  },
  "5-ufc-vegas-115": {
    excerpt:
      "У UFC Vegas 115 есть сразу несколько кандидатов на самый зрелищный бой вечера. Собрали пять поединков карда, которые выглядят наиболее перспективно с точки зрения темпа и стилистики."
  },
  "ufc-115-2": {
    title: "Почему Ренато Мойкано победит Криса Дункана на UFC Vegas 115",
    excerpt:
      "В главном бою UFC Vegas 115 Ренато Мойкано встретится с Крисом Дунканом. Разбираем, какие сильные стороны бразильца могут решить исход поединка."
  },
  "ufc-115-1": {
    title: "Почему Крис Дункан победит Ренато Мойкано на UFC Vegas 115",
    excerpt:
      "Легковесы Крис Дункан и Ренато Мойкано встретятся в главном бою UFC Vegas 115 в Лас-Вегасе. Разбираем, за счет чего Дункан может навязать свой темп и забрать победу."
  },
  "ufc-fight-night-115": {
    title: "Превью: главное событие UFC Vegas 115 в Лас-Вегасе",
    excerpt:
      "Главное событие UFC Vegas 115 пройдет в Лас-Вегасе на арене Meta APEX. Собираем ключевой контекст, интригу поединка и значение результата для дивизиона."
  },
  "ufc-115": {
    title: "Превью: UFC Vegas 115 «Мойкано против Дункана»",
    excerpt:
      "Ренато Мойкано и Крис Дункан возглавляют основной кард UFC Vegas 115 в Лас-Вегасе. Разбираем главный бой вечера, стиль соперников и ключевые сценарии поединка."
  }
};

const genericStringReplacements = [
  ["Ренато Карнеиро", "Ренато Мойкано"],
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
  ["пятибойный", "пятибоевый"],
  ["вечеpини", "вечера"],
  ["бамбата-вейт", "легчайший вес"],
  ["в легчайший вес дивизионе", "в дивизионе легчайшего веса"],
  ["бойцовая червь", "боец"]
];

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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanAnalysisText(value) {
  let next = applyNameDictionary(value);

  for (const [from, to] of genericStringReplacements) {
    next = next.split(from).join(to);
  }

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
