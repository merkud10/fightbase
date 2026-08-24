// Находит статьи с пустым title. Такие появились из-за того, что cleanNewsTitle
// прогонял заголовок через логику вырезания абзацев: заголовок вида «Источник: …»
// или со словом «чемпионате» совпадал с паттерном подписи и обнулялся, а статья
// уходила в индекс с пустыми <title>, <h1> и headline.
//
// Сама причина исправлена в lib/article-quality.ts, но уже сохранённые записи
// нужно починить вручную: исходный заголовок в базе не хранится, восстановить его
// из слага без потерь нельзя (слаг транслитерирован и лишён пунктуации).
// Поэтому скрипт только показывает, что чинить, и даёт ссылку на админку.
//
// Запуск на сервере:
//   sudo -u fightbase bash -c 'set -a && . ./.env && set +a && node scripts/find-empty-article-titles.js'

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const articles = await prisma.article.findMany({
    where: { OR: [{ title: "" }, { title: { equals: " " } }] },
    select: { id: true, slug: true, category: true, status: true, excerpt: true, publishedAt: true },
    orderBy: { publishedAt: "desc" }
  });

  if (articles.length === 0) {
    console.log("Статей с пустым заголовком нет.");
    return;
  }

  console.log(`Статей с пустым заголовком: ${articles.length}\n`);

  for (const article of articles) {
    const date = article.publishedAt.toISOString().slice(0, 10);
    console.log(`[${article.status}] ${article.category}  ${date}`);
    console.log(`  слаг:    ${article.slug}`);
    console.log(`  админка: /admin/articles/${article.id}`);
    console.log(`  лид:     ${String(article.excerpt || "").slice(0, 160)}`);
    console.log("");
  }

  console.log("Заголовок нужно вписать руками в админке: слаг подсказывает исходный текст,");
  console.log("лид — содержание. Автоподстановка из слага дала бы поломанную русскую строку.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
