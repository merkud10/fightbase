#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434/api/generate";
const DEFAULT_MODEL = "qwen35-aggressive:latest";
const DEFAULT_BASE_URL = process.env.INGEST_BASE_URL || "http://localhost:3000";
const MAX_SOURCE_ARTICLES = 16;
const MAX_BODY_LENGTH = 5200;

const PREDICTION_SOURCES = [
  {
    label: "UFC",
    promotionSlugs: ["ufc"],
    listingUrl: "https://www.ufc.com/news",
    articlePattern: /^https:\/\/www\.ufc\.com\/news\/[^?#]+$/i,
    keywords: ["preview", "fight-by-fight-preview", "keys-to-victory", "at-stake", "breakdown", "analysis", "matchup"],
    sourceType: "official"
  },
  {
    label: "Sherdog Features",
    promotionSlugs: ["ufc", "one", "pfl"],
    listingUrl: "https://www.sherdog.com/news/articles/list",
    articlePattern: /^https:\/\/www\.sherdog\.com\/news\/articles\/[^?#]+$/i,
    keywords: ["preview", "breakdown", "picks", "analysis", "matchup", "by-the-numbers"],
    sourceType: "press_release"
  },
  {
    label: "MMA Fighting",
    promotionSlugs: ["ufc", "one", "pfl"],
    listingUrl: "https://www.mmafighting.com/latest-news",
    articlePattern: /^https:\/\/www\.mmafighting\.com\/\d{4}\/\d{1,2}\/\d{1,2}\/[^?#]+$/i,
    keywords: ["preview", "predictions", "analysis", "breakdown", "picks", "best-bets", "fight-card-preview"],
    sourceType: "press_release"
  },
  {
    label: "ONE Championship Features",
    promotionSlugs: ["one"],
    listingUrl: "https://www.onefc.com/category/features/",
    articlePattern: /^https:\/\/www\.onefc\.com\/(?:features|news)\/[^?#]+\/?$/i,
    keywords: ["preview", "breakdown", "analysis", "keys-to-victory", "steal-the-show", "things-to-know", "at-stake"],
    sourceType: "official"
  }
];

function readEnvValueFromFile(name) {
  try {
    const envPath = path.join(process.cwd(), ".env");
    const contents = fs.readFileSync(envPath, "utf8");
    const match = contents.match(new RegExp(`^${name}="?([^"\\r\\n]+)"?$`, "m"));
    return match?.[1]?.trim() || "";
  } catch {
    return "";
  }
}

function readEnv(name, fallback = "") {
  return process.env[name] || readEnvValueFromFile(name) || fallback;
}

function parseArgs(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    dryRun: false,
    days: 21,
    sourceDays: 21,
    limitFights: 18,
    limitPerSource: 2,
    rewrite: true
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--base-url" && argv[index + 1]) {
      options.baseUrl = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--days" && argv[index + 1]) {
      options.days = Number(argv[index + 1]) || options.days;
      index += 1;
      continue;
    }

    if (arg === "--source-days" && argv[index + 1]) {
      options.sourceDays = Number(argv[index + 1]) || options.sourceDays;
      index += 1;
      continue;
    }

    if (arg === "--limit-fights" && argv[index + 1]) {
      options.limitFights = Number(argv[index + 1]) || options.limitFights;
      index += 1;
      continue;
    }

    if (arg === "--limit-per-source" && argv[index + 1]) {
      options.limitPerSource = Number(argv[index + 1]) || options.limitPerSource;
      index += 1;
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--no-rewrite") {
      options.rewrite = false;
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

function getLetterStats(value) {
  const cyrillic = (String(value || "").match(/[А-Яа-яЁё]/g) || []).length;
  const latin = (String(value || "").match(/[A-Za-z]/g) || []).length;
  return {
    cyrillic,
    latin,
    total: cyrillic + latin
  };
}

function looksMostlyRussian(value) {
  const stats = getLetterStats(value);
  if (stats.total === 0) {
    return false;
  }

  return stats.cyrillic / stats.total >= 0.6;
}

function normalizeForMatch(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Zа-яА-ЯёЁ0-9]+/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countAliasMatches(haystack, alias) {
  const normalizedAlias = normalizeForMatch(alias);

  if (!normalizedAlias || normalizedAlias.length < 3) {
    return 0;
  }

  const pattern = new RegExp(`(^|\\s)${escapeRegex(normalizedAlias)}(?=$|\\s)`, "g");
  return haystack.match(pattern)?.length || 0;
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

function extractParagraphs(html, limit = 10) {
  return Array.from(html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi))
    .map((match) => decodeHtml(match[1]))
    .filter((paragraph) => paragraph.length >= 80)
    .filter(
      (paragraph) =>
        !/cookie|newsletter|subscribe|advertisement|read more|all rights reserved|unlock more|fight pass|upgrade licence|video is not available|please try again|continue watching|cancel/i.test(
          paragraph
        )
    )
    .slice(0, limit);
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

function isUtilityArticle(headline, body) {
  return /\b(how to watch|watch live|where to watch|live on|start time|broadcast|streaming|live results)\b/i.test(
    `${headline} ${body}`
  );
}

function isPredictionLikeArticle(headline, body) {
  return /\b(preview|prediction|predictions|breakdown|analysis|picks|best bets|keys to victory|fight by fight preview|matchup|at stake|things to know|could steal the show|by the numbers)\b/i.test(
    `${headline} ${body}`
  );
}

async function fetchHtml(url, attempts = 2) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": "FightBasePredictionBot/0.1",
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

function prioritizeCandidateLinks(source, candidateLinks) {
  const prioritized = [];
  const lowerKeywords = source.keywords.map((keyword) => keyword.toLowerCase());

  for (const url of candidateLinks) {
    const lowerUrl = url.toLowerCase();
    const matchedKeyword = lowerKeywords.find((keyword) => lowerUrl.includes(keyword));
    prioritized.push({
      url,
      score: matchedKeyword ? 2 : 1
    });
  }

  return prioritized
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.url)
    .slice(0, MAX_SOURCE_ARTICLES);
}

function matchesSourceKeyword(source, url, headline) {
  const haystack = `${String(url || "").toLowerCase()} ${String(headline || "").toLowerCase()}`;
  return source.keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

async function collectSourceArticles(source, options) {
  const listingHtml = await fetchHtml(source.listingUrl);
  const candidateLinks = prioritizeCandidateLinks(
    source,
    collectCandidateLinks(source.listingUrl, listingHtml, source.articlePattern)
  );
  const threshold = Date.now() - options.sourceDays * 24 * 60 * 60 * 1000;
  const articles = [];

  for (const url of candidateLinks) {
    try {
      const html = await fetchHtml(url);
      const publishedAt = parsePublishedAt(html);

      if (publishedAt && publishedAt.getTime() < threshold) {
        continue;
      }

      const headline = matchMeta(html, "og:title") || matchTag(html, "title") || url;
      const description = matchMeta(html, "description") || matchMeta(html, "og:description");
      const paragraphs = extractParagraphs(html, 12);
      const body = [description, ...paragraphs].filter(Boolean).join("\n\n").trim();
      const coverImageUrl = extractMetaImage(html, url);

      if (!body || !coverImageUrl) {
        continue;
      }

      if (!matchesSourceKeyword(source, url, headline)) {
        continue;
      }

      if (isUtilityArticle(headline, body) || !isPredictionLikeArticle(headline, body)) {
        continue;
      }

      articles.push({
        sourceLabel: source.label,
        sourceType: source.sourceType,
        sourceUrl: url,
        headline,
        body,
        paragraphs,
        coverImageUrl,
        publishedAt: publishedAt?.toISOString() || new Date().toISOString(),
        promotionSlugs: source.promotionSlugs
      });
    } catch (error) {
      console.error(`[PREDICTION-SOURCE] skipped ${url}: ${error.message || error}`);
    }
  }

  return articles;
}

function buildFightAliases(fighter) {
  const fullName = String(fighter.name || "").trim();
  const lastName = fullName.split(/\s+/).filter(Boolean).slice(-1)[0] || "";
  return Array.from(new Set([fullName, fighter.nameRu || "", lastName].filter((value) => String(value).trim().length >= 3)));
}

function buildEventAliases(event) {
  return Array.from(
    new Set(
      [
        event.name,
        event.slug.replace(/-/g, " "),
        `${event.promotion.shortName || event.promotion.name} ${String(event.name).match(/\d+/)?.[0] || ""}`.trim()
      ].filter((value) => String(value || "").trim())
    )
  );
}

function scoreFightArticleMatch(fight, article) {
  const haystack = normalizeForMatch(`${article.headline}\n${article.body}\n${article.sourceUrl}`);
  const headlineHaystack = normalizeForMatch(article.headline);
  const fighterAAliases = buildFightAliases(fight.fighterA);
  const fighterBAliases = buildFightAliases(fight.fighterB);
  const eventAliases = buildEventAliases(fight.event);

  const fighterAScore = fighterAAliases.reduce((sum, alias) => sum + countAliasMatches(haystack, alias) * 24, 0);
  const fighterBScore = fighterBAliases.reduce((sum, alias) => sum + countAliasMatches(haystack, alias) * 24, 0);
  const fighterAHeadlineScore = fighterAAliases.reduce((sum, alias) => sum + countAliasMatches(headlineHaystack, alias) * 35, 0);
  const fighterBHeadlineScore = fighterBAliases.reduce((sum, alias) => sum + countAliasMatches(headlineHaystack, alias) * 35, 0);
  const eventScore = eventAliases.reduce((sum, alias) => sum + countAliasMatches(haystack, alias) * 8, 0);
  const previewScore = /\b(preview|prediction|picks|analysis|breakdown|keys to victory|fight by fight preview|matchup|best bets)\b/i.test(
    `${article.headline} ${article.body}`
  )
    ? 16
    : 0;
  const utilityArticle = isUtilityArticle(article.headline, article.body);
  const promotionScore = article.promotionSlugs.includes(fight.event.promotion.slug) ? 12 : 0;
  const bothFightersBonus = fighterAScore > 0 && fighterBScore > 0 ? 40 : 0;
  const oneFighterAndEventBonus =
    (fighterAScore > 0 && eventScore > 0 ? 15 : 0) + (fighterBScore > 0 && eventScore > 0 ? 15 : 0);

  const totalScore =
    fighterAScore +
    fighterBScore +
    fighterAHeadlineScore +
    fighterBHeadlineScore +
    eventScore +
    previewScore +
    promotionScore +
    bothFightersBonus +
    oneFighterAndEventBonus;

  return {
    totalScore,
    fighterMentioned: fighterAScore > 0 || fighterBScore > 0,
    bothFightersMentioned: fighterAScore > 0 && fighterBScore > 0,
    utilityArticle
  };
}

function extractRelevantParagraphs(article, fight) {
  const fighterAliases = [...buildFightAliases(fight.fighterA), ...buildFightAliases(fight.fighterB)]
    .map((alias) => normalizeForMatch(alias))
    .filter(Boolean);
  const otherEventNames = buildOtherEventFighterNames(fight)
    .map((name) => normalizeForMatch(name))
    .filter(Boolean);
  const scored = article.paragraphs
    .map((paragraph, index) => {
      const normalized = normalizeForMatch(paragraph);
      if (otherEventNames.some((name) => normalized.includes(name))) {
        return { index, paragraph, score: 0 };
      }

      const score = fighterAliases.reduce((sum, alias) => sum + (normalized.includes(alias) ? 1 : 0), 0);
      return { index, paragraph, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index);

  return scored
    .slice(0, 3)
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.paragraph);
}

function sanitizeJsonPayload(value) {
  const raw = String(value || "").trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced?.[1]?.trim() ?? raw;
}

function parseJsonObject(value) {
  const sanitized = sanitizeJsonPayload(value);

  try {
    return JSON.parse(sanitized);
  } catch {
    const start = sanitized.indexOf("{");
    const end = sanitized.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(sanitized.slice(start, end + 1));
    }

    throw new Error("Invalid JSON returned by prediction rewrite model");
  }
}

function buildPredictionHeadline(fight) {
  return `${fight.fighterA.name} - ${fight.fighterB.name}: прогноз и разбор боя на ${fight.event.name}`;
}

function buildFallbackFightBody(fight, article) {
  const paragraphs = extractRelevantParagraphs(article, fight);
  return [
    `${fight.fighterA.name} и ${fight.fighterB.name} встретятся на турнире ${fight.event.name}. Внешний источник перед боем акцентирует внимание на ключевых деталях этого матчапа.`,
    ...paragraphs
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, MAX_BODY_LENGTH)
    .trim();
}

function buildFighterStatLine(fighter) {
  const parts = [
    `record ${fighter.record || "unknown"}`,
    fighter.sigStrikesLandedPerMin != null ? `SLpM ${fighter.sigStrikesLandedPerMin.toFixed(2)}` : "",
    fighter.strikeAccuracy != null ? `strike accuracy ${Math.round(fighter.strikeAccuracy)}%` : "",
    fighter.takedownAveragePer15 != null ? `TD avg ${fighter.takedownAveragePer15.toFixed(2)}` : "",
    fighter.submissionAveragePer15 != null ? `sub avg ${fighter.submissionAveragePer15.toFixed(2)}` : ""
  ].filter(Boolean);

  return `${fighter.name}: ${parts.join(", ")}`;
}

function buildOtherEventFighterNames(fight) {
  const ownIds = new Set([fight.fighterAId, fight.fighterBId]);
  const names = [];

  for (const eventFight of fight.event.fights || []) {
    if (ownIds.has(eventFight.fighterAId) || ownIds.has(eventFight.fighterBId)) {
      continue;
    }

    names.push(eventFight.fighterA.name, eventFight.fighterB.name);
  }

  return Array.from(new Set(names.filter(Boolean)));
}

function mentionsUnrelatedEventFighters(body, fight) {
  const normalizedBody = normalizeForMatch(body);
  return buildOtherEventFighterNames(fight).some((name) => {
    const normalized = normalizeForMatch(name);
    return normalized && normalizedBody.includes(normalized);
  });
}

async function generateRussianRepair(body, context) {
  const url = readEnv("OLLAMA_URL", DEFAULT_OLLAMA_URL);
  const model = readEnv("PREDICTION_REWRITE_MODEL", readEnv("AI_DISCOVERY_MODEL", DEFAULT_MODEL));
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      stream: false,
      format: "json",
      options: {
        temperature: 0.2
      },
      prompt: [
        "You are fixing a draft for a Russian-language MMA media outlet.",
        "Rewrite the text into clean natural Russian only.",
        "Do not leave English sentences except for official names, fighter names, and promotion names.",
        "Keep facts intact and do not invent new details.",
        "Return strict JSON with one key only: body.",
        "",
        `Fight: ${context.fightLabel}`,
        `Event: ${context.eventName}`,
        "Draft:",
        body
      ].join("\n")
    })
  });

  if (!response.ok) {
    throw new Error(`Repair model HTTP ${response.status}`);
  }

  const payload = await response.json();
  const parsed = parseJsonObject(payload.response || "");
  return String(parsed.body || "").trim();
}

async function refineFightSpecificDraft(fight, body) {
  const url = readEnv("OLLAMA_URL", DEFAULT_OLLAMA_URL);
  const model = readEnv("PREDICTION_REWRITE_MODEL", readEnv("AI_DISCOVERY_MODEL", DEFAULT_MODEL));
  const otherNames = buildOtherEventFighterNames(fight).slice(0, 20).join(", ");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      stream: false,
      format: "json",
      options: {
        temperature: 0.15
      },
      prompt: [
        "You are polishing a fight preview for a Russian-language MMA media outlet.",
        "Rewrite the draft into clean Russian and keep the focus on one exact fight only.",
        "Do not mention unrelated fights from the same event.",
        "Mention only the target fighters by name unless an official event name is required.",
        "Use a compact editorial tone: intro, angle for fighter A, angle for fighter B, likely scenario.",
        "Do not invent facts or statistics.",
        "Return strict JSON with one key only: body.",
        "",
        `Target fight: ${fight.fighterA.name} vs ${fight.fighterB.name}`,
        `Event: ${fight.event.name}`,
        `Weight class: ${fight.weightClass || "unknown"}`,
        `Target fighter stats: ${buildFighterStatLine(fight.fighterA)}`,
        `Target fighter stats: ${buildFighterStatLine(fight.fighterB)}`,
        `Do not mention these other event fighters: ${otherNames || "none"}`,
        "",
        "Draft:",
        body
      ].join("\n")
    })
  });

  if (!response.ok) {
    throw new Error(`Refine model HTTP ${response.status}`);
  }

  const payload = await response.json();
  const parsed = parseJsonObject(payload.response || "");
  return String(parsed.body || "").trim();
}

async function rewriteFightPrediction(fight, article) {
  const url = readEnv("OLLAMA_URL", DEFAULT_OLLAMA_URL);
  const model = readEnv("PREDICTION_REWRITE_MODEL", readEnv("AI_DISCOVERY_MODEL", DEFAULT_MODEL));
  const relevantParagraphs = extractRelevantParagraphs(article, fight).join("\n\n");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      stream: false,
      format: "json",
      options: {
        temperature: 0.35
      },
      prompt: [
        "You are an MMA editor for a Russian-language media outlet.",
        "Write a fight-specific preview article in Russian for the exact bout below using only the source material.",
        "This is a rewrite, not a translation. Keep it factual, compact, and natural for Russian MMA media.",
        "Focus on this fight only, even if the source article covers the full card.",
        "Do not invent statistics, injuries, quotes, odds, or rumors that are not clearly present in the source.",
        "Return strict JSON with one key only: body.",
        "The body should be 4-6 concise paragraphs without markdown.",
        "",
        `Fight: ${fight.fighterA.name} vs ${fight.fighterB.name}`,
        `Event: ${fight.event.name}`,
        `Promotion: ${fight.event.promotion.shortName || fight.event.promotion.name}`,
        `Weight class: ${fight.weightClass || "unknown"}`,
        `Source headline: ${article.headline}`,
        `Source URL: ${article.sourceUrl}`,
        "Source material:",
        relevantParagraphs.slice(0, MAX_BODY_LENGTH)
      ].join("\n")
    })
  });

  if (!response.ok) {
    throw new Error(`Rewrite model HTTP ${response.status}`);
  }

  const payload = await response.json();
  const parsed = parseJsonObject(payload.response || "");
  let body = String(parsed.body || "").trim();

  if (!body) {
    throw new Error("Rewrite model returned empty body");
  }

  if (!looksMostlyRussian(body)) {
    body = await generateRussianRepair(body, {
      fightLabel: `${fight.fighterA.name} vs ${fight.fighterB.name}`,
      eventName: fight.event.name
    });
  }

  body = await refineFightSpecificDraft(fight, body).catch(() => body);

  if (mentionsUnrelatedEventFighters(body, fight)) {
    body = await refineFightSpecificDraft(fight, body);
  }

  if (!body || !looksMostlyRussian(body)) {
    throw new Error("Rewrite model did not return a clean Russian draft");
  }

  return body;
}

async function fetchUpcomingFights(options) {
  const threshold = new Date(Date.now() + options.days * 24 * 60 * 60 * 1000);
  return prisma.fight.findMany({
    where: {
      status: "scheduled",
      event: {
        status: "upcoming",
        date: {
          lte: threshold
        }
      }
    },
    include: {
      event: {
        include: {
          promotion: true,
          fights: {
            select: {
              fighterAId: true,
              fighterBId: true,
              fighterA: {
                select: {
                  name: true
                }
              },
              fighterB: {
                select: {
                  name: true
                }
              }
            }
          }
        }
      },
      fighterA: true,
      fighterB: true
    },
    orderBy: [{ event: { date: "asc" } }, { createdAt: "asc" }],
    take: options.limitFights
  });
}

async function fightAlreadyCovered(fight) {
  const article = await prisma.article.findFirst({
    where: {
      category: "analysis",
      status: "published",
      eventId: fight.eventId,
      fighterMap: {
        some: {
          fighterId: fight.fighterAId
        }
      },
      AND: [
        {
          fighterMap: {
            some: {
              fighterId: fight.fighterBId
            }
          }
        }
      ]
    },
    select: {
      id: true,
      slug: true
    }
  });

  return article;
}

function chooseBestArticlesForFight(fight, articles, limitPerSource) {
  return articles
    .map((article) => ({
      article,
      match: scoreFightArticleMatch(fight, article),
      paragraphCount: extractRelevantParagraphs(article, fight).length
    }))
    .filter((entry) => !entry.match.utilityArticle)
    .filter((entry) => entry.match.totalScore >= 70)
    .filter((entry) => entry.match.bothFightersMentioned || entry.match.totalScore >= 120)
    .filter((entry) => entry.paragraphCount > 0)
    .sort((left, right) => right.match.totalScore - left.match.totalScore)
    .slice(0, limitPerSource);
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

async function ensureBaseUrlReachable(baseUrl) {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/health`);
  if (!response.ok) {
    throw new Error(`Failed to reach ${baseUrl}/api/health: HTTP ${response.status}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const sourceArticleMap = new Map();

  for (const source of PREDICTION_SOURCES) {
    try {
      const articles = await collectSourceArticles(source, options);
      sourceArticleMap.set(source.label, articles);
    } catch (error) {
      console.error(`[PREDICTION-SOURCE] failed ${source.label}: ${error.message || error}`);
      sourceArticleMap.set(source.label, []);
    }
  }

  const fights = await fetchUpcomingFights(options);
  const plans = [];

  for (const fight of fights) {
    const existing = await fightAlreadyCovered(fight);
    if (existing) {
      continue;
    }

    const relevantArticles = PREDICTION_SOURCES.filter((source) => source.promotionSlugs.includes(fight.event.promotion.slug))
      .flatMap((source) => sourceArticleMap.get(source.label) || []);
    const matches = chooseBestArticlesForFight(fight, relevantArticles, options.limitPerSource);

    if (matches.length === 0) {
      continue;
    }

    plans.push({
      fight,
      article: matches[0].article,
      score: matches[0].match.totalScore
    });
  }

  console.log(`Upcoming fights scanned: ${fights.length}`);
  console.log(`Fight prediction matches: ${plans.length}`);

  if (options.dryRun) {
    plans.forEach((plan, index) => {
      console.log(
        `[${index + 1}] ${plan.fight.event.promotion.slug} | ${plan.fight.event.slug} | ${plan.fight.fighterA.name} vs ${plan.fight.fighterB.name} | score ${plan.score}`
      );
      console.log(`    ${plan.article.sourceLabel} | ${plan.article.headline}`);
      console.log(`    ${plan.article.sourceUrl}`);
    });
    await prisma.$disconnect();
    return;
  }

  await ensureBaseUrlReachable(options.baseUrl);

  let created = 0;
  let duplicates = 0;
  let failed = 0;

  for (const plan of plans) {
    try {
      const headline = buildPredictionHeadline(plan.fight);
      const body = options.rewrite
        ? await rewriteFightPrediction(plan.fight, plan.article).catch(() => buildFallbackFightBody(plan.fight, plan.article))
        : buildFallbackFightBody(plan.fight, plan.article);

      const payload = await postDraft(options.baseUrl, {
        headline,
        body,
        publishedAt: plan.article.publishedAt,
        sourceLabel: plan.article.sourceLabel,
        sourceUrl: plan.article.sourceUrl,
        coverImageUrl: plan.article.coverImageUrl,
        sourceType: plan.article.sourceType,
        category: "analysis",
        promotionSlug: plan.fight.event.promotion.slug,
        eventSlug: plan.fight.event.slug,
        fighterSlugs: [plan.fight.fighterA.slug, plan.fight.fighterB.slug],
        tagSlugs: ["preview"],
        status: "published"
      });

      if (payload.draft.duplicate) {
        duplicates += 1;
      } else {
        created += 1;
      }

      console.log(
        `[FIGHT-PREDICTION] ${payload.draft.duplicate ? "duplicate" : "created"} | ${payload.draft.slug} | ${plan.fight.fighterA.name} vs ${plan.fight.fighterB.name}`
      );
    } catch (error) {
      failed += 1;
      console.error(`[FIGHT-PREDICTION] failed | ${plan.fight.event.slug} | ${plan.fight.fighterA.name} vs ${plan.fight.fighterB.name}`);
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
