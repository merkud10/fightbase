#!/usr/bin/env node

const { URL } = require("node:url");
const { PrismaClient } = require("@prisma/client");

const { classifyArticleWithAi } = require("./ai-article-taxonomy");
const { ensureUfcFightersForText } = require("./ensure-ufc-fighters");
const { buildInternalApiHeaders } = require("./internal-api");

const prisma = new PrismaClient();
const ENABLED_PROMOTIONS = new Set(["ufc"]);

const ALL_SOURCES = [
  {
    label: "UFC",
    promotionSlug: "ufc",
    listingUrl: "https://www.ufc.com/news",
    articlePattern: /^https:\/\/www\.ufc\.com\/news\/[^?#]+$/i,
    streams: ["news", "predictions", "analysis", "quotes"],
    targetKeywords: {
      quotes: ["interview", "reacts", "reaction", "media-day", "press-conference", "says", "exclusive", "post-fight", "pre-fight"],
      predictions: ["preview", "fight-by-fight-preview", "keys-to-victory", "at-stake", "breakdown", "analysis", "matchup"],
      analysis: ["preview", "fight-by-fight-preview", "keys-to-victory", "at-stake", "breakdown", "analysis", "matchup", "prospect-watch"]
    },
    sourceType: "official"
  },
  {
    label: "Sherdog",
    listingUrl: "https://www.sherdog.com/tag/ufc",
    articlePattern: /^https:\/\/www\.sherdog\.com\/news\/(?:news|articles)\/[^?#]+$/i,
    streams: ["news", "quotes", "predictions", "analysis"],
    targetKeywords: {
      quotes: ["says", "reacts", "interview", "admits", "vows", "expects", "discusses", "reveals", "talks", "responds"],
      predictions: ["preview", "breakdown", "picks", "analysis", "matchup", "by-the-numbers"],
      analysis: ["preview", "breakdown", "analysis", "matchup", "by-the-numbers", "five-things", "prime-picks"]
    },
    sourceType: "press_release"
  },
  {
    label: "MMA Fighting",
    listingUrl: "https://www.mmafighting.com/latest-news",
    articlePattern: /^https:\/\/www\.mmafighting\.com\/\d{4}\/\d{1,2}\/\d{1,2}\/[^?#]+$/i,
    streams: ["news", "quotes", "predictions", "analysis"],
    targetKeywords: {
      quotes: ["interview", "reacts", "reaction", "says", "media-day", "discusses", "reveals", "responds", "talks"],
      predictions: ["preview", "predictions", "analysis", "breakdown", "picks", "best-bets", "fight-card-preview"],
      analysis: ["preview", "analysis", "breakdown", "matchup", "fight-card-preview", "rankings", "pros-and-cons"]
    },
    sourceType: "press_release"
  },
  {
    label: "MMA Junkie",
    listingUrl: "https://mmajunkie.usatoday.com/",
    articlePattern: /^https:\/\/mmajunkie\.usatoday\.com\/\d{4}\/\d{2}\/\d{2}\/[^?#]+$/i,
    streams: ["news", "quotes"],
    targetKeywords: {
      quotes: ["says", "reacts", "interview", "admits", "reveals", "talks", "responds"]
    },
    sourceType: "press_release"
  },
  {
    label: "FightNews.info",
    listingUrl: "https://fightnews.info/",
    articlePattern: /^https:\/\/fightnews\.info\/(?!votes|users|on-air|reyting)[a-z0-9][\w-]+$/i,
    streams: ["news", "quotes"],
    sourceType: "press_release",
    sourceLanguage: "ru"
  },
  {
    label: "MMA Mania",
    listingUrl: "https://www.mmamania.com/",
    articlePattern: /^https:\/\/www\.mmamania\.com\/\d{4}\/\d{1,2}\/\d{1,2}\/[^?#]+$/i,
    streams: ["news", "quotes"],
    targetKeywords: {
      quotes: ["says", "reacts", "interview", "responds", "reveals", "talks", "discusses"]
    },
    sourceType: "press_release"
  },
  {
    label: "Bloody Elbow",
    listingUrl: "https://bloodyelbow.com/",
    articlePattern: /^https:\/\/bloodyelbow\.com\/\d{4}\/\d{2}\/\d{2}\/[^?#]+$/i,
    streams: ["news", "quotes", "analysis"],
    targetKeywords: {
      quotes: ["says", "reacts", "interview", "responds", "reveals", "talks"],
      analysis: ["preview", "breakdown", "analysis", "matchup", "editorial"]
    },
    sourceType: "press_release"
  },
  {
    label: "ESPN MMA",
    listingUrl: "https://www.espn.com/mma/",
    articlePattern: /^https:\/\/www\.espn\.com\/mma\/story\/_\/id\/[^?#]+$/i,
    streams: ["news", "quotes", "analysis"],
    targetKeywords: {
      quotes: ["interview", "says", "reacts", "responds", "reveals"],
      analysis: ["preview", "breakdown", "analysis", "rankings", "picks"]
    },
    sourceType: "press_release"
  },
  {
    label: "Combat Press",
    listingUrl: "https://combatpress.com/category/news/",
    articlePattern: /^https:\/\/combatpress\.com\/\d{4}\/\d{2}\/[^?#]+$/i,
    streams: ["news", "predictions", "analysis"],
    targetKeywords: {
      predictions: ["preview", "predictions", "picks", "breakdown"],
      analysis: ["preview", "analysis", "breakdown", "rankings"]
    },
    sourceType: "press_release"
  },
  {
    label: "BJPenn.com",
    listingUrl: "https://www.bjpenn.com/mma-news/",
    articlePattern: /^https:\/\/www\.bjpenn\.com\/mma-news\/[^?#]+$/i,
    streams: ["news", "quotes"],
    targetKeywords: {
      quotes: ["says", "reacts", "interview", "responds", "reveals", "calls-out"]
    },
    sourceType: "press_release"
  },
  {
    label: "Sports.ru MMA",
    listingUrl: "https://www.sports.ru/mma/",
    articlePattern: /^https:\/\/www\.sports\.ru\/mma\/\d+[\w-]*\.html$/i,
    streams: ["news", "quotes"],
    targetKeywords: {
      quotes: ["интервью", "заявил", "рассказал", "ответил", "отреагировал"]
    },
    sourceType: "press_release",
    sourceLanguage: "ru"
  },
  {
    label: "Championat UFC",
    listingUrl: "https://www.championat.ru/news/boxing/_ufc/1.html",
    articlePattern: /^https:\/\/www\.championat\.ru\/boxing\/news-\d+-[\w-]+\.html$/i,
    streams: ["news", "quotes", "analysis"],
    targetKeywords: {
      quotes: ["интервью", "заявил", "рассказал", "ответил", "отреагировал"],
      analysis: ["превью", "прогноз", "разбор", "анализ"]
    },
    sourceType: "press_release",
    sourceLanguage: "ru"
  },
];

const SOURCES = ALL_SOURCES.filter((source) => !source.promotionSlug || ENABLED_PROMOTIONS.has(source.promotionSlug));

function parseArgs(argv) {
  const options = {
    baseUrl: process.env.INGEST_BASE_URL || "http://localhost:3000",
    dryRun: false,
    days: 7,
    limitPerSource: 8,
    target: "all",
    sourceLabel: ""
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base-url" && argv[index + 1]) {
      options.baseUrl = argv[++index];
      continue;
    }
    if (arg === "--days" && argv[index + 1]) {
      options.days = Number(argv[++index]) || 7;
      continue;
    }
    if (arg === "--limit-per-source" && argv[index + 1]) {
      options.limitPerSource = Number(argv[++index]) || 8;
      continue;
    }
    if (arg === "--target" && argv[index + 1]) {
      options.target = argv[++index];
      continue;
    }
    if (arg === "--source-label" && argv[index + 1]) {
      options.sourceLabel = argv[++index];
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

function isolateArticleBody(html) {
  const containers = [
    /<div[^>]+class="[^"]*content\s+body_content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i,
    /<div[^>]+class="[^"]*news-content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i,
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<div[^>]+class="[^"]*article[_-]?(?:body|content|text)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]+class="[^"]*post[_-]?(?:body|content|text)[^"]*"[^>]*>([\s\S]*?)<\/div>/i
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

function extractParagraphs(html, limit = 30) {
  const body = isolateArticleBody(html);
  const paragraphs = Array.from(body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi))
    .filter((match) => !isLinkOnlyParagraph(match[1]))
    .map((match) => decodeHtml(match[1]))
    .filter((paragraph) => paragraph.length >= 10)
    .filter((paragraph) => !/cookie|newsletter|subscribe|advertisement|read more|подпис|реклам/i.test(paragraph))
    .slice(0, limit);

  if (paragraphs.length > 0) {
    return paragraphs.join("\n\n").trim();
  }

  return body
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(h2|h3|center|blockquote|iframe)>/gi, "\n")
    .replace(/<(h2|h3)[^>]*>/gi, "\n")
    .replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, "$1")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split(/\n\s*\n+/)
    .map((paragraph) => decodeHtml(paragraph))
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph.length >= 30)
    .filter((paragraph) => !/cookie|newsletter|subscribe|advertisement|read more|подпис|реклам/i.test(paragraph))
    .slice(0, limit)
    .join("\n\n")
    .trim();
}

function extractMetaImage(html, pageUrl) {
  const candidate = matchMeta(html, "og:image") || matchMeta(html, "twitter:image") || matchMeta(html, "og:image:url");
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
  const isInterviewLike =
    /\b(interview|exclusive|says|opens up|reacts|quote|quoted|press conference|media scrum|told|discusses|talks about|reveals|responds|admits|expects|vows|addresses|comments on|breaks silence|post-fight|pre-fight)\b/i.test(
      text
    ) || /\b(intervyu|otvetil|rasskazal|zayavil|prokommentiroval|otreagiroval|podelilsya|vyskazalsya)\b/i.test(text);
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

function hasBroadMmaSignal(headline, body, url) {
  return /\b(?:ufc|mma)\b/i.test(`${headline} ${body} ${url}`);
}

function matchesTargetStream(source, target) {
  return target === "all" || (Array.isArray(source.streams) && source.streams.includes(target));
}

function categoryMatchesTarget(category, target) {
  if (target === "all") return true;
  if (target === "news") return category === "news";
  if (target === "quotes") return category === "interview";
  if (target === "predictions") return category === "analysis";
  if (target === "analysis") return category === "analysis";
  return false;
}

function inferTagSlugs(category, headline, body) {
  const text = `${headline} ${body}`.toLowerCase();
  const tags = [];

  if (category === "analysis") {
    tags.push("preview", "analysis");
  }
  if (/\b(result|results|wins|defeats|stops|submits|knocks out|tko|ko|decision|scorecard)\b/i.test(text)) {
    tags.push("results");
  }
  if (/\b(announce|announced|booking|booked|set for|will headline|returns on|scheduled|added to)\b/i.test(text)) {
    tags.push("announcements");
  }
  if (/\b(rumor|rumour|targeting|in talks|expected to|could face)\b/i.test(text)) {
    tags.push("rumors");
  }
  if (/\b(preview|prediction|breakdown|matchup|keys to victory|fight pick|odds)\b/i.test(text)) {
    tags.push("preview");
  }
  if (/\b(post-fight|after the fight|reacts to|winner|aftermath|what.?s next|called out)\b/i.test(text)) {
    tags.push("post-fight");
  }

  return Array.from(new Set(tags));
}

function looksLikeUfcArticle(source, headline, body, url) {
  const text = `${source.label} ${source.promotionSlug || ""} ${headline} ${body} ${url}`.toLowerCase();
  return /\bufc\b|fight night|dwcs|contender series|dana white|apex|tuf\b/.test(text);
}

function mergeTaxonomyFighters(taxonomyContext, importedFighters) {
  for (const imported of importedFighters) {
    const fighter = imported.fighter;
    if (!fighter || taxonomyContext.fighters.some((entry) => entry.slug === fighter.slug)) {
      continue;
    }

    taxonomyContext.fighters.push({
      slug: fighter.slug,
      name: fighter.name,
      nameRu: fighter.nameRu,
      nickname: fighter.nickname,
      promotionSlug: "ufc"
    });
  }
}

const HOST_CLIENT_ERROR_STREAK = new Map();
const HOST_BAN_THRESHOLD = 3;

function hostnameFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

async function fetchHtml(url) {
  const host = hostnameFromUrl(url);
  if (host && (HOST_CLIENT_ERROR_STREAK.get(host) ?? 0) >= HOST_BAN_THRESHOLD) {
    throw new Error(`Skipping ${url}: host ${host} banned after repeated 4xx responses`);
  }

  let lastError = null;
  const maxAttempts = 2;
  const timeoutMs = 20000;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      });

      if (!response.ok) {
        if (host && response.status >= 400 && response.status < 500) {
          HOST_CLIENT_ERROR_STREAK.set(host, (HOST_CLIENT_ERROR_STREAK.get(host) ?? 0) + 1);
          throw new Error(`HTTP ${response.status}`);
        }
        lastError = new Error(`HTTP ${response.status}`);
        continue;
      }

      if (host) {
        HOST_CLIENT_ERROR_STREAK.set(host, 0);
      }
      return await response.text();
    } catch (error) {
      lastError = error;
      if (error?.message?.startsWith("HTTP 4")) {
        break;
      }
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
  const scanBudget =
    target === "analysis" ? Math.max(limitPerSource * 3, 8) : target === "quotes" ? Math.max(limitPerSource * 12, 24) : Math.max(limitPerSource * 6, 18);

  if (target === "all" || target === "news") {
    return candidateLinks.slice(0, scanBudget);
  }

  const keywords = source.targetKeywords?.[target] || [];
  const prioritized = candidateLinks.filter((url) =>
    keywords.some((keyword) => url.toLowerCase().includes(keyword.toLowerCase()))
  );

  if (prioritized.length > 0) {
    const remainder = candidateLinks.filter((url) => !prioritized.includes(url));
    return [...prioritized, ...remainder].slice(0, scanBudget);
  }

  return candidateLinks.slice(0, scanBudget);
}

function shouldRejectDiscoveredItem(item, aiTaxonomy) {
  if (!hasBroadMmaSignal(item.headline, item.body, item.sourceUrl)) {
    return "missing UFC or MMA signal";
  }
  if (!aiTaxonomy?.isUfc) {
    return "ai classified as not UFC";
  }
  return "";
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

      if (!hasBroadMmaSignal(headline, body, url)) {
        continue;
      }

      const coverImageUrl = extractMetaImage(html, url);
      const heuristicCategory = inferContentCategory(source, headline, body);
      const isUfcArticle = looksLikeUfcArticle(source, headline, body, url);

      if (!coverImageUrl) {
        continue;
      }

      if (isUfcArticle) {
        try {
          const importedFighters = await ensureUfcFightersForText(prisma, `${headline}\n${body}`, 2);
          mergeTaxonomyFighters(taxonomyContext, importedFighters);
        } catch (error) {
          console.error(`[UFC-RESOLVE] skipped enrichment for ${url}: ${error.message || error}`);
        }
      }

      let aiTaxonomy = {
        isUfc: isUfcArticle,
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
        promotionSlug: aiTaxonomy.promotionSlug || source.promotionSlug || (aiTaxonomy.isUfc ? "ufc" : undefined),
        headline,
        body,
        category: finalCategory,
        fighterSlugs: aiTaxonomy.fighterSlugs,
        tagSlugs: aiTaxonomy.tagSlugs && aiTaxonomy.tagSlugs.length > 0
          ? aiTaxonomy.tagSlugs
          : inferTagSlugs(finalCategory, headline, body),
        coverImageUrl,
        publishedAt: publishedAt.toISOString(),
        status: "published"
      };

      const rejectionReason = shouldRejectDiscoveredItem(item, aiTaxonomy);
      if (rejectionReason) {
        console.log(`[FILTER] skipped ${url}: ${rejectionReason}`);
        continue;
      }

      if (!categoryMatchesTarget(item.category, options.target)) {
        continue;
      }

      collected.push(item);
    } catch (error) {
      console.error(`[DISCOVERY] skipped ${url}: ${error.message || error}`);
    }
  }

  return collected.sort((left, right) => new Date(left.publishedAt) - new Date(right.publishedAt));
}

async function postDraft(baseUrl, item) {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/ingest/draft`, {
    method: "POST",
    headers: buildInternalApiHeaders({
      "Content-Type": "application/json"
    }),
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
    fighters: (
      await prisma.fighter.findMany({
        select: { slug: true, name: true, nameRu: true, nickname: true, promotion: { select: { slug: true } } },
        take: 4000
      })
    ).map((fighter) => ({
      slug: fighter.slug,
      name: fighter.name,
      nameRu: fighter.nameRu,
      nickname: fighter.nickname,
      promotionSlug: fighter.promotion.slug
    }))
  };

  const selectedSources = SOURCES.filter((source) => {
    if (!matchesTargetStream(source, options.target)) {
      return false;
    }
    if (options.sourceLabel && source.label !== options.sourceLabel) {
      return false;
    }
    return true;
  });

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
      console.log(`[INGEST] ${payload.draft.duplicate ? "duplicate" : "created"} | ${payload.draft.slug} | ${item.sourceLabel} | ${item.category}`);
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
