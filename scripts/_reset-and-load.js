#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const BASE_URL = "http://localhost:3001";

const ARTICLES_TO_SCRAPE = [
  {
    url: "https://fightnews.info/obyavlen-polnyy-kard-turnira-ufc-v-belom-dome-meyn-iventom-stal-boy-topuriya-getzhi",
    label: "FightNews.info"
  },
  {
    url: "https://fightnews.info/rezultaty-turnira-ufc-fight-night-271",
    label: "FightNews.info"
  },
  {
    url: "https://fightnews.info/dzhon-dzhons-stal-ambassadorom-iba-bare-knuckle-matushka-rossiya-usynovila-novogo-syna",
    label: "FightNews.info"
  },
  {
    url: "https://www.sports.ru/boxing/1117121417-diaz-otkazalsya-ot-boya-s-konorom-v-ufc-mne-interesno-dratsya-s-luchsh.html",
    label: "Sports.ru"
  },
  {
    url: "https://www.sports.ru/boxing/1117121130-fedor-emelyanenko-est-mysli-vystupit-na-chempionate-rossii-po-boevomu-.html",
    label: "Sports.ru"
  },
  {
    url: "https://www.sports.ru/boxing/1117121034-czarukyan-o-xollouee-nulevoj-uroven-borby-maks-zanimaetsya-etim-vidom-.html",
    label: "Sports.ru"
  }
];

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&ldquo;|&rdquo;/gi, '"')
    .replace(/&rsquo;|&lsquo;/gi, "'")
    .replace(/&ndash;|&mdash;/gi, "-")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractMeta(html, key) {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${key}["']`, "i"),
    new RegExp(`<meta[^>]+name=["']${key}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${key}["']`, "i")
  ];

  for (const p of patterns) {
    const m = html.match(p);
    if (m && m[1]) return decodeHtml(m[1]);
  }
  return "";
}

function isolateArticleBody(html) {
  const containers = [
    /<div[^>]+class="[^"]*news-content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i,
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<div[^>]+class="[^"]*article[_-]?(?:body|content|text)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]+class="[^"]*post[_-]?(?:body|content|text)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  ];
  for (const re of containers) {
    const m = html.match(re);
    if (m) return m[0];
  }
  return html;
}

function isLinkOnlyParagraph(rawHtml) {
  const stripped = rawHtml.replace(/<!--[\s\S]*?-->/g, "").trim();
  return /^<a\s[^>]*>[\s\S]*<\/a>$/i.test(stripped);
}

function isSectionHeader(rawHtml) {
  const stripped = rawHtml.replace(/<!--[\s\S]*?-->/g, "").trim();
  return /^<(strong|b|em)\b[^>]*>[\s\S]*<\/\1>$/i.test(stripped);
}

function extractParagraphs(html) {
  const body = isolateArticleBody(html);
  return Array.from(body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi))
    .filter((m) => !isLinkOnlyParagraph(m[1]))
    .map((m) => decodeHtml(m[1]))
    .filter((p) => p.length >= 10)
    .filter((p) => !/cookie|newsletter|subscribe|advertisement|read more|подпис|реклам/i.test(p))
    .slice(0, 30)
    .join("\n\n");
}

function extractDate(html) {
  const candidates = [
    extractMeta(html, "article:published_time"),
    extractMeta(html, "og:published_time"),
    (html.match(/<time[^>]+datetime=["']([^"']+)["']/i) || [])[1] || "",
    (html.match(/"datePublished":"([^"]+)"/i) || [])[1] || ""
  ].filter(Boolean);

  for (const c of candidates) {
    const d = new Date(c);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "FightBaseBot/1.0", Accept: "text/html" }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function deleteAllArticles() {
  console.log("Deleting all articles...");

  await prisma.articleFighter.deleteMany();
  await prisma.articleTag.deleteMany();
  await prisma.articleSection.deleteMany();
  await prisma.articleSource.deleteMany();
  await prisma.article.deleteMany();
  await prisma.source.deleteMany();

  const remaining = await prisma.article.count();
  console.log(`Articles remaining: ${remaining}\n`);
}

async function scrapeAndPost(entry) {
  const html = await fetchHtml(entry.url);
  const headline = extractMeta(html, "og:title") || "";
  const body = extractParagraphs(html);
  const image = extractMeta(html, "og:image");
  const date = extractDate(html);

  if (!headline || !body || body.length < 80) {
    throw new Error(`Insufficient content: headline=${headline.length}, body=${body.length}`);
  }

  const payload = {
    headline,
    body,
    publishedAt: date,
    sourceLabel: entry.label,
    sourceUrl: entry.url,
    sourceType: "press_release",
    category: "news",
    status: "published",
    sourceLanguage: "ru",
    coverImageUrl: image || undefined,
    coverImageAlt: headline
  };

  const resp = await fetch(`${BASE_URL}/api/ingest/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const result = await resp.json().catch(() => null);

  if (!resp.ok) {
    throw new Error(result?.error || `HTTP ${resp.status}`);
  }

  return result;
}

async function main() {
  await deleteAllArticles();

  let created = 0;
  let failed = 0;

  for (const entry of ARTICLES_TO_SCRAPE) {
    try {
      console.log(`Scraping: ${entry.url.slice(0, 80)}...`);
      const result = await scrapeAndPost(entry);
      const slug = result?.draft?.slug || "?";
      const fighters = result?.draft?.fighterSlugs || [];
      console.log(`  OK: slug=${slug}`);
      console.log(`  Fighters: ${fighters.length > 0 ? fighters.join(", ") : "none"}`);
      created++;
    } catch (e) {
      console.log(`  FAILED: ${e.message}`);
      failed++;
    }
    console.log("");
  }

  console.log("=== Summary ===");
  console.log(`Created: ${created}`);
  console.log(`Failed: ${failed}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect().catch(() => {});
  process.exit(1);
});
