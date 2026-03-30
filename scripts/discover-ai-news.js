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

function sanitizeItem(item, fallbackStatus) {
  return {
    headline: String(item.headline || "").trim(),
    body: String(item.body || "").trim(),
    publishedAt: normalizeDate(item.publishedAt),
    sourceLabel: String(item.sourceLabel || "").trim(),
    sourceUrl: normalizeUrl(item.sourceUrl),
    sourceType: VALID_SOURCE_TYPES.has(item.sourceType) ? item.sourceType : "press_release",
    category: "news",
    promotionSlug: String(item.promotionSlug || "").trim() || undefined,
    eventSlug: String(item.eventSlug || "").trim() || undefined,
    fighterSlugs: normalizeList(item.fighterSlugs),
    tagSlugs: normalizeList(item.tagSlugs),
    status: VALID_STATUSES.has(item.status) ? item.status : fallbackStatus,
    sourceLanguage: String(item.sourceLanguage || "").trim() || undefined
  };
}

function validateItem(item, requireFreshSources, lookbackHours) {
  const requiredStrings = ["headline", "body", "sourceLabel", "sourceUrl", "publishedAt"];
  const missing = requiredStrings.filter((key) => typeof item[key] !== "string" || item[key].trim().length === 0);

  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(", ")}`);
  }

  if (requireFreshSources) {
    const ageMs = Date.now() - new Date(item.publishedAt).getTime();
    const limitMs = lookbackHours * 60 * 60 * 1000;

    if (ageMs > limitMs) {
      throw new Error(`PublishedAt is older than the allowed lookback window (${lookbackHours}h)`);
    }
  }
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

async function hydrateAndValidateItem(item) {
  const { url: resolvedSourceUrl, html } = await fetchText(item.sourceUrl);
  const extractedAlt =
    extractMetaContent(html, "og:image:alt") ||
    extractMetaContent(html, "twitter:image:alt");
  const finalImageUrl = await extractBestCoverImageFromSource(html, resolvedSourceUrl);

  if (!finalImageUrl) {
    throw new Error("No valid cover image found for the source page");
  }

  return {
    ...item,
    sourceUrl: resolvedSourceUrl,
    coverImageUrl: finalImageUrl,
    coverImageAlt: item.coverImageAlt || extractedAlt || item.headline
  };
}

function buildPrompt(options) {
  const nowIso = new Date().toISOString();
  const extra = options.promptExtra ? `Additional editorial instructions:\n${options.promptExtra}\n\n` : "";

  return [
    "You are an autonomous MMA news researcher for FightBase Media.",
    "Use your internet browsing capability to find the freshest important MMA news right now.",
    `Current time: ${nowIso}.`,
    `Look back no more than ${options.lookbackHours} hours unless the information is still breaking and directly relevant.`,
    `Find up to ${options.limit} items total across Russian- and English-language coverage.`,
    `Language scope: ${options.languageScope}.`,
    "Prioritize real news, not evergreen explainers, rankings pages, or old recaps.",
    "Prioritize UFC, PFL, ONE, Bellator/PFL-related news, ACA, major title fights, injuries, bookings, results, weigh-in issues, official announcements, and high-signal fighter statements.",
    "For each selected item, verify the source URL and the publication time from the page itself.",
    "The source URL must be the real article page URL that you actually opened successfully, not a guessed path and not a homepage.",
    "Only include an item if you personally confirmed that the article page loads.",
    "Do not invent image URLs. The application will extract the image itself from the source page.",
    "Write the final headline and body in natural Russian for publication on a Russian-language MMA site.",
    "Preserve names, promotions, dates, records, and uncertainty. Do not invent facts.",
    "Use only one canonical source URL per item.",
    "If two sources cover the same story, prefer the most primary one.",
    "Skip any item if you cannot verify the source URL or approximate publication time.",
    "Return strict JSON only with this exact shape:",
    "{",
    '  "items": [',
    "    {",
    '      "headline": "Russian publication-ready headline",',
    '      "body": "Russian body text with 2-5 short paragraphs and no markdown",',
    '      "publishedAt": "ISO-8601 timestamp from the source page",',
    '      "sourceLabel": "Outlet or source name",',
    '      "sourceUrl": "https://...",',
    '      "sourceType": "official | interview | social | press_release | stats",',
    '      "promotionSlug": "ufc | pfl | one | empty string if unknown",',
    '      "eventSlug": "",',
    '      "fighterSlugs": [],',
    '      "tagSlugs": ["announcements"] or [],',
    '      "sourceLanguage": "ru or en",',
    `      "status": "${options.status}"`,
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
    .map((item) => sanitizeItem(item, options.status))
    .filter((item) => item.headline && item.body && item.sourceLabel && item.sourceUrl && item.publishedAt);
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

  const rawItems = await callOllama(options);
  const validatedItems = [];

  for (const item of rawItems) {
    try {
      validateItem(item, options.requireFreshSources, options.lookbackHours);
      const hydratedItem = await hydrateAndValidateItem(item);
      validatedItems.push(hydratedItem);
    } catch (error) {
      console.error(`[FILTER] skipped ${item.sourceUrl || item.headline}: ${error.message || error}`);
    }
  }

  console.log(`Validated items: ${validatedItems.length}`);

  if (options.dryRun) {
    validatedItems.forEach((item, index) => {
      console.log(`[${index + 1}] ${item.publishedAt} | ${item.sourceLabel} | ${item.headline}`);
      console.log(`    ${item.sourceUrl}`);
    });

    await finishIngestionRun(run.id, {
      status: "dry_run",
      itemCount: validatedItems.length,
      durationMs: Date.now() - startedAt,
      message: `AI discovery dry run completed with ${validatedItems.length} validated item(s).`
    });
    await disconnectIngestionRunStore();
    return;
  }

  let createdCount = 0;
  let duplicateCount = 0;
  let failedCount = 0;

  for (let index = 0; index < validatedItems.length; index += 1) {
    const item = validatedItems[index];

    try {
      const payload = await postDraft(options.baseUrl, item);
      if (payload.draft?.duplicate) {
        duplicateCount += 1;
      } else {
        createdCount += 1;
      }

      console.log(
        `[WRITE ${index + 1}/${validatedItems.length}] ${payload.draft?.duplicate ? "duplicate" : "created"}: ${payload.draft?.slug || item.headline}`
      );
    } catch (error) {
      failedCount += 1;
      console.error(`[WRITE ${index + 1}/${validatedItems.length}] failed: ${item.headline}`);
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
