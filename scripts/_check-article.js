const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const slug = process.argv[2] || "ufc-fight-night-271";
  const article = await prisma.article.findFirst({
    where: { slug: { contains: slug } },
    include: { sections: true }
  });

  if (!article) {
    console.log("Article not found");
    return;
  }

  console.log(`Title: ${article.title}`);
  console.log(`Slug: ${article.slug}`);
  console.log(`Sections: ${article.sections.length}\n`);

  for (const s of article.sections) {
    console.log(`--- Section: ${s.heading || "(no heading)"} ---`);
    console.log(`Body length: ${s.body.length}`);
    console.log(`Body:\n${s.body}\n`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
