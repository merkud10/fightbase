#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const { fetchSourceEntry } = require("./source-fetchers");
const {
  disconnectIngestionRunStore,
  failIngestionRun,
  finishIngestionRun,
  startIngestionRun
} = require("./ingestion-run-store");

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
  const startedAt = Date.now();
  let run = null;

  if (!fs.existsSync(watchlistPath)) {
    throw new Error(`Watchlist file not found: ${watchlistPath}`);
  }

  const raw = fs.readFileSync(watchlistPath, "utf8");
  const entries = JSON.parse(raw);

  if (!Array.isArray(entries)) {
    throw new Error("Watchlist file must contain a JSON array");
  }

  run = await startIngestionRun({
    sourceKind: "source_watchlist",
    mode: options.dryRun ? "dry-run" : "write",
    filePath: options.file,
    baseUrl: options.baseUrl,
    itemCount: entries.length,
    message: `Source fetch started for ${entries.length} item(s).`
  });
  global.__FETCH_SOURCE_RUN_ID__ = run.id;

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
    await finishIngestionRun(run.id, {
      status: "dry_run",
      itemCount: prepared.length,
      durationMs: Date.now() - startedAt,
      message: `Dry run completed for ${prepared.length} prepared item(s).`
    });
    await disconnectIngestionRunStore();
    return;
  }

  let createdCount = 0;
  let duplicateCount = 0;
  let failedCount = 0;

  for (let index = 0; index < prepared.length; index += 1) {
    const item = prepared[index];

    try {
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
    } catch (error) {
      failedCount += 1;
      console.error(`[WRITE ${index + 1}/${prepared.length}] failed: ${item.headline}`);
      console.error(error.message || error);
    }
  }

  console.log("");
  console.log("Summary");
  console.log(`Created: ${createdCount}`);
  console.log(`Duplicates: ${duplicateCount}`);
  console.log(`Failed: ${failedCount}`);

  await finishIngestionRun(run.id, {
    status: failedCount > 0 ? (createdCount > 0 || duplicateCount > 0 ? "partial" : "failed") : "success",
    createdCount,
    duplicateCount,
    failedCount,
    durationMs: Date.now() - startedAt,
    message: `Source fetch completed for ${prepared.length} item(s).`
  });
  await disconnectIngestionRunStore();
}

main().catch((error) => {
  Promise.resolve()
    .then(async () => {
      if (global.__FETCH_SOURCE_RUN_ID__) {
        await failIngestionRun(global.__FETCH_SOURCE_RUN_ID__, {
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
