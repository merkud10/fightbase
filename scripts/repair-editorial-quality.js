#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const nameDictionary = require("../lib/ufc-name-dictionary.json");

const genericStringReplacements = [
  ["Ренато Карнеиро", "Ренато Мойкано"],
  ["Крис Дансон", "Крис Дункан"],
  ["Криса Дансона", "Криса Дункана"],
  ["Дансон", "Дункан"],
  ["Карнейро", "Мойкано"],
  ["Мойяно", "Мойкано"],
  ["Meta Apex", "Meta APEX"],
  ["Мета Апексе", "Meta APEX"],
  ["восьмираундового", "трехраундового"],
  ["пятибойный", "пятибоевый"],
  ["вечеpини", "вечера"],
  ["бамбата-вейт", "легчайший вес"],
  ["в легчайший вес дивизионе", "в дивизионе легчайшего веса"],
  ["бойцовая червь", "боец"],
  ["Консистенция — ключ к успеху", "Стабильность — ключ к успеху"],
  ["Шоу Томми Макмиллена Только Начинается", "Шоу Томми Макмиллена только начинается"],
  ["Счастлив возвращаться", "Рад возвращению"],
  ["Продолжать двигаться вперед", "Продолжать идти вперед"]
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

function cleanEditorialText(value) {
  let next = applyNameDictionary(value);

  for (const [from, to] of genericStringReplacements) {
    next = next.split(from).join(to);
  }

  return normalizeWhitespace(next);
}

function buildMeaning(value) {
  const excerpt = normalizeWhitespace(value).slice(0, 160).trimEnd();
  return excerpt ? `Почему это важно: ${excerpt}${excerpt.length >= 160 ? "..." : ""}` : "";
}

async function main() {
  const articles = await prisma.article.findMany({
    where: { category: { in: ["news", "interview"] } },
    include: { sections: { orderBy: { sortOrder: "asc" } } }
  });

  let updatedArticles = 0;
  let updatedSections = 0;

  for (const article of articles) {
    const nextTitle = cleanEditorialText(article.title);
    const nextExcerpt = cleanEditorialText(article.excerpt || "");
    const nextMeaning = buildMeaning(article.sections[0]?.body || nextExcerpt);

    if (
      nextTitle !== article.title ||
      nextExcerpt !== (article.excerpt || "") ||
      nextMeaning !== (article.meaning || "")
    ) {
      await prisma.article.update({
        where: { id: article.id },
        data: {
          title: nextTitle,
          excerpt: nextExcerpt,
          meaning: nextMeaning
        }
      });
      updatedArticles += 1;
    }

    for (const section of article.sections) {
      const nextBody = cleanEditorialText(section.body);
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
