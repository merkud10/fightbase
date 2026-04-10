#!/usr/bin/env node

const http = require("node:http");
const https = require("node:https");

const { PrismaClient } = require("@prisma/client");
const { persistImageLocally } = require("./local-image-store");

const prisma = new PrismaClient();

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const transport = target.protocol === "https:" ? https : http;

    const request = transport.request(
      url,
      {
        method: "GET",
        headers: {
          "User-Agent": "FightBaseBot/1.0"
        }
      },
      (response) => {
        const statusCode = response.statusCode || 500;

        if ([301, 302, 303, 307, 308].includes(statusCode) && response.headers.location) {
          const redirectedUrl = new URL(response.headers.location, url).toString();
          response.resume();
          fetchText(redirectedUrl).then(resolve).catch(reject);
          return;
        }

        if (statusCode >= 400) {
          response.resume();
          reject(new Error(`HTTP ${statusCode}`));
          return;
        }

        const chunks = [];
        response.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("end", () => {
          resolve(Buffer.concat(chunks).toString("utf8"));
        });
      }
    );

    request.on("error", reject);
    request.end();
  });
}

function extractMetaContent(html, propertyName) {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${propertyName}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${propertyName}["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+name=["']${propertyName}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${propertyName}["'][^>]*>`, "i")
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}

async function extractArticleCover(sourceUrl) {
  const html = await fetchText(sourceUrl);
  const image =
    extractMetaContent(html, "og:image") ||
    extractMetaContent(html, "twitter:image") ||
    extractMetaContent(html, "og:image:url");
  const alt =
    extractMetaContent(html, "og:image:alt") ||
    extractMetaContent(html, "twitter:image:alt");

  if (!image) {
    return null;
  }

  return {
    coverImageUrl: new URL(image, sourceUrl).toString(),
    coverImageAlt: alt || null
  };
}

async function main() {
  const articles = await prisma.article.findMany({
    where: {
      OR: [{ coverImageUrl: null }, { coverImageUrl: "" }, { coverImageUrl: { startsWith: "http" } }]
    },
    include: {
      sourceMap: {
        include: {
          source: true
        }
      }
    },
    orderBy: { publishedAt: "desc" }
  });

  let updated = 0;
  let failed = 0;

  for (const article of articles) {
    try {
      const existingExternalCover =
        typeof article.coverImageUrl === "string" && article.coverImageUrl.startsWith("http")
          ? article.coverImageUrl
          : null;
      const sourceUrl = article.sourceMap[0]?.source?.url;
      const cover =
        existingExternalCover
          ? {
              coverImageUrl: existingExternalCover,
              coverImageAlt: article.coverImageAlt || article.title
            }
          : sourceUrl
            ? await extractArticleCover(sourceUrl)
            : null;

      if (!cover?.coverImageUrl) {
        continue;
      }

      const localizedCoverImageUrl = await persistImageLocally({
        bucket: "articles",
        key: article.slug,
        sourceUrl: cover.coverImageUrl
      }).catch(() => cover.coverImageUrl);

      await prisma.article.update({
        where: { id: article.id },
        data: {
          coverImageUrl: localizedCoverImageUrl,
          coverImageAlt: cover.coverImageAlt || article.title
        }
      });

      updated += 1;
      console.log(`Updated article image: ${article.slug}`);
    } catch (error) {
      failed += 1;
      console.error(`Failed article image backfill: ${article.slug}`);
      console.error(error.message || error);
    }
  }

  console.log(JSON.stringify({ updated, failed }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
