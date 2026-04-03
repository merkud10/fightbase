#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const {
  disconnectIngestionRunStore,
  failIngestionRun,
  finishIngestionRun,
  startIngestionRun
} = require("./ingestion-run-store");

const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434/api/generate";
const DEFAULT_MODEL = "qwen35-aggressive:latest";
const VALID_SOURCE_TYPES = new Set(["official", "interview", "social", "press_release", "stats"]);
const VALID_STATUSES = new Set(["draft", "review", "published"]);
const ALLOWED_PROMOTION_SLUGS = new Set(["", "ufc"]);

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

function parseBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function parseArgs(argv) {
  const options = {
    baseUrl: readEnv("INGEST_BASE_URL", "http://localhost:3000"),
    ollamaUrl: readEnv("OLLAMA_URL", DEFAULT_OLLAMA_URL),
    model: readEnv("OLLAMA_MODEL", DEFAULT_MODEL),
    dryRun: false,
    lookbackHours: Number(readEnv("AI_DISCOVERY_LOOKBACK_HOURS", "8")) || 8,
    limit: Number(readEnv("AI_DISCOVERY_ITEM_LIMIT", "8")) || 8,
    status: readEnv("AI_DISCOVERY_STATUS", "published") || "published",
    requireFreshSources: !parseBoolean(readEnv("AI_DISCOVERY_ALLOW_OLDER_SOURCES", "")),
    languageScope: readEnv("AI_DISCOVERY_LANGUAGE_SCOPE", "ru,en"),
    promptExtra: readEnv("AI_DISCOVERY_PROMPT_EXTRA", "")
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--base-url" && argv[index + 1]) {
      options.baseUrl = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--ollama-url" && argv[index + 1]) {
      options.ollamaUrl = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--model" && argv[index + 1]) {
      options.model = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--lookback-hours" && argv[index + 1]) {
      options.lookbackHours = Number(argv[index + 1]) || options.lookbackHours;
      index += 1;
      continue;
    }

    if (arg === "--limit" && argv[index + 1]) {
      options.limit = Number(argv[index + 1]) || options.limit;
      index += 1;
      continue;
    }

    if (arg === "--status" && argv[index + 1]) {
      options.status = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--allow-older-sources") {
      options.requireFreshSources = false;
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
    }
  }

  if (!VALID_STATUSES.has(options.status)) {
    throw new Error(`Unsupported article status "${options.status}". Use draft, review, or published.`);
  }

  return options;
}

function sanitizeJsonPayload(value) {
  const raw = String(value || "").trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced?.[1]?.trim() ?? raw;
}

async function fetchText(url) {
  const response = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: {
      "User-Agent": "FightBaseDiscoveryBot/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return {
    url: response.url,
    html: await response.text()
  };
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
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function normalizeUrl(value) {
  try {
    return new URL(String(value || "").trim()).toString();
  } catch {
    return "";
  }
}

function normalizeDate(value) {
  const date = new Date(String(value || "").trim());
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString();
}

function normalizeList(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

function sanitizeDiscoveredUrl(item) {
  const normalizedPromotionSlug = String(item.promotionSlug || "").trim().toLowerCase();
  return {
    sourceUrl: normalizeUrl(item.sourceUrl),
    sourceLabel: String(item.sourceLabel || "").trim(),
    sourceType: VALID_SOURCE_TYPES.has(item.sourceType) ? item.sourceType : "press_release",
    promotionSlug: ALLOWED_PROMOTION_SLUGS.has(normalizedPromotionSlug) ? normalizedPromotionSlug || undefined : undefined,
    sourceLanguage: String(item.sourceLanguage || "").trim() || undefined,
    publishedAt: normalizeDate(item.publishedAt)
  };
}

function validateDiscoveredUrl(item, requireFreshSources, lookbackHours) {
  if (!item.sourceUrl) {
    throw new Error("Missing sourceUrl");
  }

  if (!item.sourceLabel) {
    throw new Error("Missing sourceLabel");
  }

  if (requireFreshSources && item.publishedAt) {
    const ageMs = Date.now() - new Date(item.publishedAt).getTime();
    const limitMs = lookbackHours * 60 * 60 * 1000;

    if (ageMs > limitMs) {
      throw new Error(`PublishedAt is older than the allowed lookback window (${lookbackHours}h)`);
    }
  }
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

function extractParagraphs(html, limit = 30) {
  const body = isolateArticleBody(html);
  return Array.from(body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi))
    .filter((match) => !isLinkOnlyParagraph(match[1]))
    .map((match) => decodeHtml(match[1]))
    .filter((paragraph) => paragraph.length >= 10)
    .filter((paragraph) => !/cookie|newsletter|subscribe|advertisement|read more|подпис|реклам/i.test(paragraph))
    .slice(0, limit)
    .join("\n\n")
    .trim();
}

function extractTitle(html) {
  const ogTitle = extractMetaContent(html, "og:title");
  if (ogTitle) {
    return decodeHtml(ogTitle);
  }

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return titleMatch?.[1] ? decodeHtml(titleMatch[1]) : "";
}

function extractPublishedAt(html) {
  const candidates = [
    extractMetaContent(html, "article:published_time"),
    extractMetaContent(html, "og:published_time"),
    extractMetaContent(html, "publish-date"),
    extractMetaContent(html, "publication_date"),
    extractMetaContent(html, "date"),
    (html.match(/<time[^>]+datetime=["']([^"']+)["']/i) || [])[1] || "",
    (html.match(/"datePublished":"([^"]+)"/i) || [])[1] || ""
  ].filter(Boolean);

  for (const value of candidates) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  return "";
}

async function scrapeArticlePage(sourceUrl) {
  const { url: resolvedUrl, html } = await fetchText(sourceUrl);

  const headline = extractTitle(html);
  if (!headline) {
    throw new Error("Could not extract headline from page");
  }

  const body = extractParagraphs(html);
  if (!body || body.length < 100) {
    throw new Error("Could not extract sufficient body text from page");
  }

  const coverImageUrl = await extractBestCoverImageFromSource(html, resolvedUrl);
  const coverImageAlt =
    extractMetaContent(html, "og:image:alt") ||
    extractMetaContent(html, "twitter:image:alt") ||
    headline;

  const publishedAt = extractPublishedAt(html);

  return {
    headline,
    body,
    coverImageUrl,
    coverImageAlt,
    publishedAt,
    resolvedUrl
  };
}

function looksLikePlaceholderImage(url) {
  return /logo|placeholder|default|avatar|sprite|icon|favicon|blank|pixel|silhouette/i.test(String(url || ""));
}

async function validateImageUrl(url, refererUrl) {
  const normalized = normalizeUrl(url);
  if (!normalized || looksLikePlaceholderImage(normalized)) {
    return null;
  }

  try {
    const response = await fetch(normalized, {
      method: "HEAD",
      redirect: "follow",
      headers: refererUrl ? { Referer: refererUrl, "User-Agent": "FightBaseDiscoveryBot/1.0" } : { "User-Agent": "FightBaseDiscoveryBot/1.0" }
    });

    const contentType = response.headers.get("content-type") || "";
    if (response.ok && contentType.startsWith("image/")) {
      return response.url;
    }
  } catch {}

  try {
    const response = await fetch(normalized, {
      method: "GET",
      redirect: "follow",
      headers: refererUrl ? { Referer: refererUrl, "User-Agent": "FightBaseDiscoveryBot/1.0" } : { "User-Agent": "FightBaseDiscoveryBot/1.0" }
    });

    const contentType = response.headers.get("content-type") || "";
    if (response.ok && contentType.startsWith("image/")) {
      return response.url;
    }
  } catch {}

  return null;
}

function extractJsonLdImages(html, baseUrl) {
  const matches = Array.from(html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi));
  const results = [];

  for (const match of matches) {
    const raw = String(match[1] || "").trim();
    if (!raw) {
      continue;
    }

    try {
      const parsed = JSON.parse(raw);
      const queue = Array.isArray(parsed) ? [...parsed] : [parsed];

      while (queue.length > 0) {
        const current = queue.shift();
        if (!current || typeof current !== "object") {
          continue;
        }

        if (Array.isArray(current)) {
          queue.push(...current);
          continue;
        }

        const image = current.image;
        if (typeof image === "string") {
          results.push(normalizeUrl(new URL(image, baseUrl).toString()));
        } else if (Array.isArray(image)) {
          for (const item of image) {
            if (typeof item === "string") {
              results.push(normalizeUrl(new URL(item, baseUrl).toString()));
            } else if (item && typeof item === "object" && typeof item.url === "string") {
              results.push(normalizeUrl(new URL(item.url, baseUrl).toString()));
            }
          }
        } else if (image && typeof image === "object" && typeof image.url === "string") {
          results.push(normalizeUrl(new URL(image.url, baseUrl).toString()));
        }

        for (const value of Object.values(current)) {
          if (value && typeof value === "object") {
            queue.push(value);
          }
        }
      }
    } catch {}
  }

  return results.filter(Boolean);
}

function extractInlineImageCandidates(html, baseUrl) {
  const matches = Array.from(html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi));
  const results = [];

  for (const match of matches) {
    const src = String(match[1] || "").trim();
    if (!src || src.startsWith("data:")) {
      continue;
    }

    try {
      results.push(new URL(src, baseUrl).toString());
    } catch {}
  }

  return results;
}

async function extractBestCoverImageFromSource(html, sourceUrl) {
  const candidates = [
    extractMetaContent(html, "og:image"),
    extractMetaContent(html, "twitter:image"),
    extractMetaContent(html, "og:image:url"),
    extractMetaContent(html, "twitter:image:src"),
    extractMetaContent(html, "image"),
    ...extractJsonLdImages(html, sourceUrl),
    ...extractInlineImageCandidates(html, sourceUrl)
  ]
    .filter(Boolean)
    .map((url) => {
      try {
        return new URL(String(url), sourceUrl).toString();
      } catch {
        return "";
      }
    })
    .filter(Boolean);

  for (const candidate of candidates) {
    const validated = await validateImageUrl(candidate, sourceUrl);
    if (validated) {
      return validated;
    }
  }

  return null;
}

function buildPrompt(options) {
  const nowIso = new Date().toISOString();
  const extra = options.promptExtra ? `Additional editorial instructions:\n${options.promptExtra}\n\n` : "";

  return [
    "You are an autonomous MMA news URL researcher for FightBase Media.",
    "Use your internet browsing capability to find URLs of the freshest important MMA news articles right now.",
    `Current time: ${nowIso}.`,
    `Look back no more than ${options.lookbackHours} hours unless the information is still breaking and directly relevant.`,
    `Find up to ${options.limit} article URLs total across Russian- and English-language coverage.`,
    `Language scope: ${options.languageScope}.`,
    "Prioritize real news, not evergreen explainers, rankings pages, or old recaps.",
    "Prioritize UFC news only: bookings, injuries, results, weigh-in issues, official announcements, title implications, and high-signal fighter statements tied to UFC.",
    "The source URL must be the real article page URL that you actually opened successfully, not a guessed path and not a homepage.",
    "Only include an item if you personally confirmed that the article page loads and contains a news article.",
    "Do NOT write headlines or article body text. The application will scrape and process the content itself.",
    "Use only one canonical source URL per story.",
    "If two sources cover the same story, prefer the most primary one.",
    "Skip any item if you cannot verify the source URL or approximate publication time.",
    "Return strict JSON only with this exact shape:",
    "{",
    '  "items": [',
    "    {",
    '      "sourceUrl": "https://...",',
    '      "sourceLabel": "Outlet or source name",',
    '      "sourceType": "official | interview | social | press_release | stats",',
    '      "promotionSlug": "ufc | empty string if unknown",',
    '      "sourceLanguage": "ru or en",',
    '      "publishedAt": "ISO-8601 timestamp from the source page"',
    "    }",
    "  ]",
    "}",
    extra,
    "Return no commentary, no prose before JSON, and no markdown fences."
  ].join("\n");
}

async function callOllama(options) {
  const payload = {
    model: options.model,
    stream: false,
    format: "json",
    prompt: buildPrompt(options),
    options: {
      temperature: 0.2
    }
  };

  const response = await fetch(options.ollamaUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed with HTTP ${response.status}: ${await response.text()}`);
  }

  const raw = await response.json();
  const output = sanitizeJsonPayload(raw?.response || "");

  if (!output) {
    throw new Error("Model returned an empty response");
  }

  const parsed = JSON.parse(output);
  const items = Array.isArray(parsed) ? parsed : parsed?.items;

  if (!Array.isArray(items)) {
    throw new Error("Model response does not contain an items array");
  }

  return items
    .map((item) => sanitizeDiscoveredUrl(item))
    .filter((item) => item.sourceUrl && item.sourceLabel);
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
  const startedAt = Date.now();
  let run = null;

  run = await startIngestionRun({
    sourceKind: "ai_discovery",
    mode: options.dryRun ? "dry-run" : "write",
    filePath: `model:${options.model}`,
    baseUrl: options.baseUrl,
    itemCount: options.limit,
    message: `AI discovery started with ${options.model}.`
  });
  global.__AI_DISCOVERY_RUN_ID__ = run.id;

  console.log(`Model: ${options.model}`);
  console.log(`Target: ${options.baseUrl}`);
  console.log(`Mode: ${options.dryRun ? "dry-run" : "write"}`);
  console.log(`Lookback hours: ${options.lookbackHours}`);
  console.log(`Requested item limit: ${options.limit}`);

  const discoveredUrls = await callOllama(options);
  console.log(`LLM discovered ${discoveredUrls.length} URL(s)`);

  const scrapedItems = [];

  for (const discovered of discoveredUrls) {
    try {
      validateDiscoveredUrl(discovered, options.requireFreshSources, options.lookbackHours);

      const scraped = await scrapeArticlePage(discovered.sourceUrl);

      const item = {
        headline: scraped.headline,
        body: scraped.body,
        publishedAt: scraped.publishedAt || discovered.publishedAt,
        sourceLabel: discovered.sourceLabel,
        sourceUrl: scraped.resolvedUrl || discovered.sourceUrl,
        sourceType: discovered.sourceType,
        category: "news",
        promotionSlug: discovered.promotionSlug,
        sourceLanguage: discovered.sourceLanguage,
        status: options.status,
        coverImageUrl: scraped.coverImageUrl || undefined,
        coverImageAlt: scraped.coverImageAlt || scraped.headline
      };

      if (!item.coverImageUrl) {
        console.error(`[SCRAPE] skipped ${discovered.sourceUrl}: no cover image found`);
        continue;
      }

      scrapedItems.push(item);
      console.log(`[SCRAPE] OK ${discovered.sourceLabel}: ${scraped.headline.slice(0, 80)}`);
    } catch (error) {
      console.error(`[SCRAPE] skipped ${discovered.sourceUrl}: ${error.message || error}`);
    }
  }

  console.log(`Scraped items: ${scrapedItems.length}`);

  if (options.dryRun) {
    scrapedItems.forEach((item, index) => {
      console.log(`[${index + 1}] ${item.publishedAt} | ${item.sourceLabel} | ${item.headline}`);
      console.log(`    ${item.sourceUrl}`);
    });

    await finishIngestionRun(run.id, {
      status: "dry_run",
      itemCount: scrapedItems.length,
      durationMs: Date.now() - startedAt,
      message: `AI discovery dry run completed with ${scrapedItems.length} scraped item(s).`
    });
    await disconnectIngestionRunStore();
    return;
  }

  let createdCount = 0;
  let duplicateCount = 0;
  let failedCount = 0;

  for (let index = 0; index < scrapedItems.length; index += 1) {
    const item = scrapedItems[index];

    try {
      const payload = await postDraft(options.baseUrl, item);
      if (payload.draft?.duplicate) {
        duplicateCount += 1;
      } else {
        createdCount += 1;
      }

      console.log(
        `[WRITE ${index + 1}/${scrapedItems.length}] ${payload.draft?.duplicate ? "duplicate" : "created"}: ${payload.draft?.slug || item.headline}`
      );
    } catch (error) {
      failedCount += 1;
      console.error(`[WRITE ${index + 1}/${scrapedItems.length}] failed: ${item.headline}`);
      console.error(error.message || error);
    }
  }

  const status = failedCount > 0 ? (createdCount > 0 || duplicateCount > 0 ? "partial" : "failed") : "success";

  console.log("");
  console.log("Summary");
  console.log(`Created: ${createdCount}`);
  console.log(`Duplicates: ${duplicateCount}`);
  console.log(`Failed: ${failedCount}`);

  await finishIngestionRun(run.id, {
    status,
    createdCount,
    duplicateCount,
    failedCount,
    durationMs: Date.now() - startedAt,
    message: `AI discovery ${status}.`
  });
  await disconnectIngestionRunStore();
}

main().catch((error) => {
  Promise.resolve()
    .then(async () => {
      if (global.__AI_DISCOVERY_RUN_ID__) {
        await failIngestionRun(global.__AI_DISCOVERY_RUN_ID__, {
          durationMs: 0,
          message: error.message || String(error)
        });
      }
    })
    .finally(async () => {
      console.error(error.message || error);
      await disconnectIngestionRunStore().catch(() => {});
      process.exit(1);
    });
});
