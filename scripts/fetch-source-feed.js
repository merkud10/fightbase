#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const { fetchSourceEntry } = require("./source-fetchers");

function parseArgs(argv) {
  const options = {
    file: "ingestion/sample-watchlist.json",
    baseUrl: process.env.INGEST_BASE_URL || "http://localhost:3000",
    dryRun: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--file" && argv[index + 1]) {
      options.file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--base-url" && argv[index + 1]) {
      options.baseUrl = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
    }
  }

  return options;
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
    const reason = payload?.error || `HTTP ${response.status}`;
    throw new Error(reason);
  }

  return payload;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const watchlistPath = path.resolve(process.cwd(), options.file);

  if (!fs.existsSync(watchlistPath)) {
    throw new Error(`Watchlist file not found: ${watchlistPath}`);
  }

  const raw = fs.readFileSync(watchlistPath, "utf8");
  const entries = JSON.parse(raw);

  if (!Array.isArray(entries)) {
    throw new Error("Watchlist file must contain a JSON array");
  }

  console.log(`Source entries: ${entries.length}`);
  console.log(`Target: ${options.baseUrl}`);
  console.log(`Mode: ${options.dryRun ? "dry-run" : "write"}`);

  const prepared = [];

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const item = await fetchSourceEntry(entry, process.cwd());
    prepared.push(item);
    console.log(`[FETCH ${index + 1}/${entries.length}] ${item.headline}`);
  }

  if (options.dryRun) {
    return;
  }

  let createdCount = 0;
  let duplicateCount = 0;

  for (let index = 0; index < prepared.length; index += 1) {
    const item = prepared[index];
    const payload = await postDraft(options.baseUrl, {
      headline: item.headline,
      body: item.body,
      publishedAt: item.publishedAt,
      sourceLabel: item.sourceLabel,
      sourceUrl: item.url,
      sourceType: item.sourceType,
      category: item.category,
      promotionSlug: item.promotionSlug,
      eventSlug: item.eventSlug,
      fighterSlugs: item.fighterSlugs,
      tagSlugs: item.tagSlugs
    });

    if (payload.draft.duplicate) {
      duplicateCount += 1;
    } else {
      createdCount += 1;
    }

    console.log(
      `[WRITE ${index + 1}/${prepared.length}] ${payload.draft.duplicate ? "duplicate" : "created"}: ${payload.draft.slug}`
    );
  }

  console.log("");
  console.log("Summary");
  console.log(`Created: ${createdCount}`);
  console.log(`Duplicates: ${duplicateCount}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
