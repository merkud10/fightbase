const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function slugify(input) {
  return String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function looksWeakSlug(value) {
  const clean = String(value || "").trim().toLowerCase();
  return (
    !clean ||
    clean.length < 8 ||
    /^\d+(?:-\d+)?$/.test(clean) ||
    /^draft-\d+$/i.test(clean) ||
    /^ufc(?:-vegas)?-\d+(?:-\d+)?$/i.test(clean) ||
    /^ufc(?:-fight-night)?$/i.test(clean) ||
    /^ufc-(?:macau|vegas)$/i.test(clean) ||
    /^ufc-fight-night-\d+$/i.test(clean)
  );
}

function stripUrlSlugNoise(value) {
  return String(value || "")
    .trim()
    .replace(/\.(?:html?|php)$/i, "")
    .replace(/html?$/i, "")
    .replace(/^\d+-/, "")
    .replace(/^(?:news|boxing|martial-mma-ufc-news|martial-mma-news|ufc-news)-+/i, "")
    .replace(/-\d{5,}$/i, "")
    .replace(/^-+|-+$/g, "");
}

function extractSlugFromSourceUrl(sourceUrl) {
  try {
    const parsed = new URL(sourceUrl);
    const segments = parsed.pathname
      .split("/")
      .map((segment) => decodeURIComponent(segment.trim()))
      .filter(Boolean);

    for (let index = segments.length - 1; index >= 0; index -= 1) {
      const candidate = stripUrlSlugNoise(slugify(segments[index]));
      if (!looksWeakSlug(candidate)) {
        return candidate;
      }
    }
  } catch {}

  return "";
}

async function ensureUniqueArticleSlug(baseSlug, articleId) {
  let candidate = baseSlug || `article-${articleId}`;
  let counter = 1;

  while (true) {
    const existing = await prisma.article.findUnique({
      where: { slug: candidate },
      select: { id: true }
    });

    if (!existing || existing.id === articleId) {
      return candidate;
    }

    candidate = `${baseSlug || "article"}-${counter}`;
    counter += 1;
  }
}

function buildPreferredArticleSlug(title, sourceUrl, currentSlug) {
  const sourceSlug = extractSlugFromSourceUrl(sourceUrl);
  if (!looksWeakSlug(sourceSlug)) {
    return sourceSlug;
  }

  const titleSlug = slugify(title);
  if (!looksWeakSlug(titleSlug)) {
    return titleSlug;
  }

  return currentSlug;
}

async function main() {
  const articles = await prisma.article.findMany({
    where: {
      category: { in: ["news", "analysis", "interview"] }
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      sourceMap: {
        select: {
          source: {
            select: {
              url: true
            }
          }
        },
        take: 1
      }
    }
  });

  let updated = 0;

  for (const article of articles) {
    const sourceUrl = article.sourceMap[0]?.source?.url || "";
    const preferredBaseSlug = buildPreferredArticleSlug(article.title, sourceUrl, article.slug);

    if (!preferredBaseSlug || preferredBaseSlug === article.slug) {
      continue;
    }

    const nextSlug = await ensureUniqueArticleSlug(preferredBaseSlug, article.id);
    if (nextSlug === article.slug) {
      continue;
    }

    await prisma.article.update({
      where: { id: article.id },
      data: { slug: nextSlug }
    });

    updated += 1;
    console.log(`updated ${article.slug} -> ${nextSlug}`);
  }

  console.log(JSON.stringify({ updated }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
