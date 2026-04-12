#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");
const fs = require("node:fs");
const path = require("node:path");

const prisma = new PrismaClient();
const APP_ROOT = process.env.APP_ROOT || process.cwd();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml"
    }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function extractOgImage(html, pageUrl) {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["'][^>]*>/i
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) {
      try {
        return new URL(m[1], pageUrl).toString();
      } catch {
        return m[1];
      }
    }
  }
  return null;
}

async function downloadImage(imageUrl) {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
  };

  try {
    const host = new URL(imageUrl).hostname;
    if (host.includes("ufc.com") || host.includes("ufc.tv")) {
      headers.Referer = "https://www.ufc.com/";
    } else if (host.includes("sherdog.com")) {
      headers.Referer = "https://www.sherdog.com/";
    }
  } catch {}

  const direct = await fetch(imageUrl, {
    redirect: "follow",
    headers,
    signal: AbortSignal.timeout(30000)
  }).catch(() => null);

  if (direct?.ok) {
    const ct = direct.headers.get("content-type") || "";
    if (ct.startsWith("image/")) {
      return Buffer.from(await direct.arrayBuffer());
    }
  }

  const weserv = `https://images.weserv.nl/?url=${encodeURIComponent(imageUrl)}`;
  const proxy = await fetch(weserv, {
    redirect: "follow",
    signal: AbortSignal.timeout(30000)
  }).catch(() => null);

  if (proxy?.ok) {
    const ct = proxy.headers.get("content-type") || "";
    if (ct.startsWith("image/")) {
      return Buffer.from(await proxy.arrayBuffer());
    }
  }

  throw new Error(`Failed to download image from ${imageUrl}`);
}

async function main() {
  const articles = await prisma.article.findMany({
    where: {
      coverImageUrl: { startsWith: "/media/articles/" }
    },
    select: {
      id: true,
      title: true,
      coverImageUrl: true,
      sourceMap: {
        include: { source: { select: { url: true, label: true } } }
      }
    }
  });

  console.log(`Found ${articles.length} articles with local cover images\n`);

  let repaired = 0;
  let skipped = 0;
  let failed = 0;

  for (const article of articles) {
    const relPath = article.coverImageUrl.replace(/^\//, "");
    const filePath = path.join(APP_ROOT, "public", relPath);

    if (fs.existsSync(filePath)) {
      skipped += 1;
      continue;
    }

    const sourceUrl = article.sourceMap?.[0]?.source?.url;
    if (!sourceUrl) {
      console.log(`[SKIP] No source URL for "${article.title?.slice(0, 50)}"`);
      failed += 1;
      continue;
    }

    try {
      console.log(`[REPAIR] "${article.title?.slice(0, 50)}..."`);
      console.log(`  Source: ${sourceUrl}`);

      const html = await fetchHtml(sourceUrl);
      const ogImage = extractOgImage(html, sourceUrl);

      if (!ogImage) {
        console.log(`  [FAIL] No og:image found`);
        failed += 1;
        continue;
      }

      console.log(`  og:image: ${ogImage}`);
      const buffer = await downloadImage(ogImage);

      const dir = path.dirname(filePath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, buffer);

      console.log(`  [OK] Saved ${buffer.length} bytes to ${filePath}`);
      repaired += 1;

      await sleep(1000);
    } catch (error) {
      console.log(`  [FAIL] ${error.message || error}`);
      failed += 1;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Already exist: ${skipped}`);
  console.log(`Repaired: ${repaired}`);
  console.log(`Failed: ${failed}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
