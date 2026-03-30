#!/usr/bin/env node

const { URL } = require("node:url");
const { PrismaClient } = require("@prisma/client");

const { classifyArticleWithAi } = require("./ai-article-taxonomy");

const prisma = new PrismaClient();

const ALL_SOURCES = [
  {
    label: "UFC",
    promotionSlug: "ufc",
    listingUrl: "https://www.ufc.com/news",
    articlePattern: /^https:\/\/www\.ufc\.com\/news\/[^?#]+$/i,
    streams: ["news", "predictions", "quotes"],
    targetKeywords: {
      quotes: ["interview", "reacts", "reaction", "media-day", "press-conference", "says"],
      predictions: ["preview", "breakdown", "analysis", "keys-to-victory", "fight-night"]
    },
    sourceType: "official"
  },
  {
    label: "PFL",
    promotionSlug: "pfl",
    listingUrl: "https://pflmma.com/news",
    articlePattern: /^https:\/\/pflmma\.com\/(?:index\.php\/)?news\/[^?#]+$/i,
    streams: ["news"],
    sourceType: "press_release"
  },
  {
    label: "ONE Championship",
    promotionSlug: "one",
    listingUrl: "https://www.onefc.com/category/news/",
    articlePattern: /^https:\/\/www\.onefc\.com\/news\/[^?#]+\/?$/i,
    streams: ["news", "quotes"],
    targetKeywords: {
      quotes: ["interview", "says", "responds", "opens-up", "reaction"]
    },
    sourceType: "official"
  },
  {
    label: "ONE Championship Features",
    promotionSlug: "one",
    listingUrl: "https://www.onefc.com/category/features/",
    articlePattern: /^https:\/\/www\.onefc\.com\/(?:features|news)\/[^?#]+\/?$/i,
    streams: ["quotes", "predictions"],
    targetKeywords: {
      quotes: ["interview", "life", "journey", "says", "opens-up"],
      predictions: ["preview", "breakdown", "analysis", "keys-to-victory"]
    },
    sourceType: "interview"
  },
  {
    label: "Sherdog News",
    listingUrl: "https://www.sherdog.com/news/news/list",
    articlePattern: /^https:\/\/www\.sherdog\.com\/news\/news\/[^?#]+$/i,
    streams: ["news", "quotes"],
    targetKeywords: {
      quotes: ["says", "reacts", "interview", "admits", "vows", "expects"]
    },
    sourceType: "press_release"
  },
  {
    label: "Sherdog Features",
    listingUrl: "https://www.sherdog.com/news/articles/list",
    articlePattern: /^https:\/\/www\.sherdog\.com\/news\/articles\/[^?#]+$/i,
    streams: ["predictions"],
    targetKeywords: {
      predictions: ["preview", "breakdown", "picks", "analysis", "matchup"]
    },
    sourceType: "interview"
  },
  {
    label: "MMA Fighting",
    listingUrl: "https://www.mmafighting.com/latest-news",
    articlePattern: /^https:\/\/www\.mmafighting\.com\/\d{4}\/\d{1,2}\/\d{1,2}\/[^?#]+$/i,
    streams: ["news", "quotes", "predictions"],
    targetKeywords: {
      quotes: ["interview", "reacts", "reaction", "says", "media-day"],
      predictions: ["preview", "predictions", "analysis", "breakdown", "picks"]
    },
    sourceType: "press_release"
  },
  {
    label: "MMA Junkie",
    listingUrl: "https://mmajunkie.usatoday.com/",
    articlePattern: /^https:\/\/mmajunkie\.usatoday\.com\/\d{4}\/\d{2}\/\d{2}\/[^?#]+$/i,
    streams: ["news"],
    sourceType: "press_release"
  }
];

function parseArgs(argv) {
  const options = {
    baseUrl: process.env.INGEST_BASE_URL || "http://localhost:3000",
    dryRun: false,
    days: 7,
    limitPerSource: 8,
    target: "all"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--base-url" && argv[index + 1]) {
      options.baseUrl = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--days" && argv[index + 1]) {
      options.days = Number(argv[index + 1]) || 7;
      index += 1;
      continue;
    }

    if (arg === "--limit-per-source" && argv[index + 1]) {
      options.limitPerSource = Number(argv[index + 1]) || 8;
      index += 1;
      continue;
    }

    if (arg === "--target" && argv[index + 1]) {
      options.target = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
    }
  }

  return options;
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&ldquo;|&rdquo;/gi, '"')
    .replace(/&rsquo;/gi, "'")
    .replace(/&ndash;|&mdash;/gi, "-")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchMeta(html, key) {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${key}["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+name=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${key}["'][^>]*>`, "i")
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return decodeHtml(match[1]);
    }
  }

  return "";
}

function matchTag(html, tagName) {
  const match = html.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match?.[1] ? decodeHtml(match[1]) : "";
}

function parsePublishedAt(html) {
  const candidates = [
    matchMeta(html, "article:published_time"),
    matchMeta(html, "og:published_time"),
    matchMeta(html, "publish-date"),
    matchMeta(html, "publication_date"),
    matchMeta(html, "date"),
    html.match(/<time[^>]+datetime=["']([^"']+)["']/i)?.[1] || "",
    html.match(/"datePublished":"([^"]+)"/i)?.[1] || ""
  ].filter(Boolean);

  for (const value of candidates) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
}

function extractParagraphs(html, limit = 6) {
  return Array.from(html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi))
    .map((match) => decodeHtml(match[1]))
    .filter((paragraph) => paragraph.length >= 80)
    .filter((paragraph) => !/cookie|newsletter|subscribe|advertisement|read more/i.test(paragraph))
    .slice(0, limit)
    .join("\n\n")
    .trim();
}

function extractMetaImage(html, pageUrl) {
  const candidate =
    matchMeta(html, "og:image") ||
    matchMeta(html, "twitter:image") ||
    matchMeta(html, "og:image:url");

  if (!candidate) {
    return "";
  }

  try {
    return new URL(candidate, pageUrl).toString();
  } catch {
    return "";
  }
}

function inferContentCategory(source, headline, body) {
  const text = `${headline} ${body}`.toLowerCase();
  const isInterviewLike = /\b(interview|says|opens up|reacts|quote|quoted|press conference|media scrum|told)\b/i.test(text);
  const isPredictionLike = /\b(prediction|preview|breakdown|keys to victory|odds|fight pick|fight preview|matchup)\b/i.test(text);
  const isUtilityStory = /\b(how to watch|live results|stream|broadcast|schedule|start time)\b/i.test(text);

  if ((source.streams || []).includes("quotes") && isInterviewLike && !isUtilityStory) {
    return "interview";
  }

  if ((source.streams || []).includes("predictions") && isPredictionLike) {
    return "analysis";
  }

  if (isInterviewLike && !isUtilityStory) {
    return "interview";
  }

  if (isPredictionLike) {
    return "analysis";
  }

  return "news";
}

function matchesTargetStream(source, target) {
  if (target === "all") {
    return true;
  }

  return Array.isArray(source.streams) && source.streams.includes(target);
}

function categoryMatchesTarget(category, target) {
  if (target === "all") {
    return true;
  }

  if (target === "news") {
    return category === "news";
  }

  if (target === "quotes") {
    return category === "interview";
  }

  if (target === "predictions") {
    return category === "analysis";
  }

  return false;
}

function inferTagSlugs(category, headline, body) {
  const text = `${headline} ${body}`.toLowerCase();
  const tags = [];

  if (category === "analysis") {
    tags.push("preview");
  }

  if (/\b(result|results|wins|defeats|stops|submits|knocks out|tko|ko|decision)\b/i.test(text)) {
    tags.push("results");
  }

  if (/\b(announce|announced|booking|booked|set for|will headline|returns on|scheduled)\b/i.test(text)) {
    tags.push("announcements");
  }

  if (/\b(rumor|rumour|targeting|in talks|expected to|could face)\b/i.test(text)) {
    tags.push("rumors");
  }

  return Array.from(new Set(tags));
}

async function fetchHtml(url) {
  let lastError = null;
  const maxAttempts = 2;
  const timeoutMs = 10000;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": "FightBaseDiscoveryBot/0.1",
          Accept: "text/html,application/xhtml+xml"
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.text();
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }

  if (lastError?.name === "AbortError") {
    throw new Error(`Timed out while fetching ${url}`);
  }

  throw new Error(`Failed to fetch ${url}: ${lastError?.message || lastError}`);
}

function collectCandidateLinks(listingUrl, html, articlePattern) {
  const links = new Set();

  for (const match of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    try {
      const absoluteUrl = new URL(match[1], listingUrl).toString();
      if (articlePattern.test(absoluteUrl)) {
        links.add(absoluteUrl);
      }
    } catch {
      continue;
    }
  }

  return Array.from(links);
}

function prioritizeCandidateLinks(source, candidateLinks, target, limitPerSource) {
  const scanBudget = Math.max(limitPerSource * 6, 18);

  if (target === "all" || target === "news") {
    return candidateLinks.slice(0, scanBudget);
  }

  const keywords = source.targetKeywords?.[target] || [];
  const prioritized = candidateLinks.filter((url) =>
    keywords.some((keyword) => url.toLowerCase().includes(keyword.toLowerCase()))
  );

  if (prioritized.length > 0) {
    return prioritized.slice(0, scanBudget);
  }

  return candidateLinks.slice(0, scanBudget);
}

async function discoverSourceItems(source, options, taxonomyContext) {
  const listingHtml = await fetchHtml(source.listingUrl);
  const candidateLinks = prioritizeCandidateLinks(
    source,
    collectCandidateLinks(source.listingUrl, listingHtml, source.articlePattern),
    options.target,
    options.limitPerSource
  );
  const threshold = Date.now() - options.days * 24 * 60 * 60 * 1000;
  const collected = [];

  for (const url of candidateLinks) {
    if (collected.length >= options.limitPerSource) {
      break;
    }

    try {
      const html = await fetchHtml(url);
      const publishedAt = parsePublishedAt(html);

      if (!publishedAt || publishedAt.getTime() < threshold) {
        continue;
      }

      const headline = matchMeta(html, "og:title") || matchTag(html, "title") || url;
      const description = matchMeta(html, "description") || matchMeta(html, "og:description");
      const paragraphs = extractParagraphs(html);
      const body = [description, paragraphs].filter(Boolean).join("\n\n").trim() || headline;
      const heuristicCategory = inferContentCategory(source, headline, body);
      const coverImageUrl = extractMetaImage(html, url);

      if (!coverImageUrl) {
        continue;
      }

      if (!categoryMatchesTarget(heuristicCategory, options.target)) {
        continue;
      }

      let aiTaxonomy = {
        contentType: heuristicCategory,
        promotionSlug: source.promotionSlug || "",
        fighterSlugs: [],
        confidence: 0,
        reason: ""
      };

      try {
        aiTaxonomy = await classifyArticleWithAi({
          headline,
          body,
          sourceLabel: source.label,
          sourceUrl: url,
          promotions: taxonomyContext.promotions,
          fighters: taxonomyContext.fighters
        });
      } catch (error) {
        console.error(`[TAXONOMY] fallback for ${url}: ${error.message || error}`);
      }

      const finalCategory = aiTaxonomy.contentType || heuristicCategory;
      const item = {
        sourceLabel: source.label,
        sourceUrl: url,
        sourceType: source.sourceType || "official",
        promotionSlug: aiTaxonomy.promotionSlug || source.promotionSlug,
        headline,
        body,
        category: finalCategory,
        fighterSlugs: aiTaxonomy.fighterSlugs,
        tagSlugs: inferTagSlugs(finalCategory, headline, body),
        coverImageUrl,
        publishedAt: publishedAt.toISOString(),
        status: "published"
      };

      if (!categoryMatchesTarget(item.category, options.target)) {
        continue;
      }

      collected.push(item);
    } catch (error) {
      console.error(`[DISCOVERY] skipped ${url}: ${error.message || error}`);
    }
  }

  return collected.sort((left, right) => new Date(right.publishedAt) - new Date(left.publishedAt));
}

async function postDraft(baseUrl, item) {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/ingest/draft`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(item)
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error || `HTTP ${response.status}`);
  }

  return payload;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const discovered = [];
  const taxonomyContext = {
    promotions: await prisma.promotion.findMany({ select: { slug: true, name: true, shortName: true } }),
    fighters: await prisma.fighter.findMany({
      select: { slug: true, name: true, nameRu: true, nickname: true },
      take: 4000
    })
  };

  const selectedSources = ALL_SOURCES.filter((source) => matchesTargetStream(source, options.target));

  for (const source of selectedSources) {
    try {
      const items = await discoverSourceItems(source, options, taxonomyContext);
      discovered.push(...items);
    } catch (error) {
      console.error(`[SOURCE] skipped ${source.label}: ${error.message || error}`);
    }
  }

  console.log(`Target: ${options.target}`);
  console.log(`Discovered items: ${discovered.length}`);

  if (options.dryRun) {
    discovered.forEach((item, index) => {
      console.log(`[${index + 1}] ${item.category} | ${item.sourceLabel} | ${item.publishedAt.slice(0, 10)} | ${item.headline}`);
      console.log(`    ${item.sourceUrl}`);
    });
    await prisma.$disconnect();
    return;
  }

  let created = 0;
  let duplicates = 0;
  let failed = 0;

  for (const item of discovered) {
    try {
      const payload = await postDraft(options.baseUrl, item);
      if (payload.draft.duplicate) {
        duplicates += 1;
      } else {
        created += 1;
      }
      console.log(
        `[INGEST] ${payload.draft.duplicate ? "duplicate" : "created"} | ${payload.draft.slug} | ${item.sourceLabel} | ${item.category}`
      );
    } catch (error) {
      failed += 1;
      console.error(`[INGEST] failed | ${item.sourceUrl}`);
      console.error(error.message || error);
    }
  }

  console.log("");
  console.log("Summary");
  console.log(`Created: ${created}`);
  console.log(`Duplicates: ${duplicates}`);
  console.log(`Failed: ${failed}`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error.message || error);
  prisma.$disconnect().catch(() => {}).finally(() => {
    process.exit(1);
  });
});
