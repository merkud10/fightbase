#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const {
  disconnectIngestionRunStore,
  failIngestionRun,
  finishIngestionRun,
  startIngestionRun
} = require("./ingestion-run-store");
const { buildInternalApiHeaders } = require("./internal-api");

function parseArgs(argv) {
  const options = {
    file: "ingestion/sample-feed.json",
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

function assertFeedItem(item, index) {
  const requiredFields = ["headline", "body", "sourceLabel", "sourceUrl"];
  const missingFields = requiredFields.filter((field) => typeof item?.[field] !== "string" || item[field].trim().length === 0);

  if (missingFields.length > 0) {
    throw new Error(`Feed item ${index + 1} is missing required fields: ${missingFields.join(", ")}`);
  }
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
    const reason = payload?.error || `HTTP ${response.status}`;
    throw new Error(reason);
  }

  return payload;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const feedPath = path.resolve(process.cwd(), options.file);
  let run = null;
  const startedAt = Date.now();

  if (!fs.existsSync(feedPath)) {
    throw new Error(`Feed file not found: ${feedPath}`);
  }

  const raw = fs.readFileSync(feedPath, "utf8");
  const items = JSON.parse(raw);

  if (!Array.isArray(items)) {
    throw new Error("Feed file must contain a JSON array");
  }

  items.forEach((item, index) => assertFeedItem(item, index));
  run = await startIngestionRun({
    sourceKind: "json_feed",
    mode: options.dryRun ? "dry-run" : "write",
    filePath: options.file,
    baseUrl: options.baseUrl,
    itemCount: items.length,
    message: `Feed ingestion started for ${items.length} item(s).`
  });
  global.__INGEST_FEED_RUN_ID__ = run.id;

  console.log(`Feed items: ${items.length}`);
  console.log(`Target: ${options.baseUrl}`);
  console.log(`Mode: ${options.dryRun ? "dry-run" : "write"}`);

  if (options.dryRun) {
    items.forEach((item, index) => {
      console.log(`[DRY RUN ${index + 1}] ${item.headline}`);
    });
    await finishIngestionRun(run.id, {
      status: "dry_run",
      durationMs: Date.now() - startedAt,
      message: `Dry run completed for ${items.length} item(s).`
    });
    await disconnectIngestionRunStore();
    return;
  }

  const results = [];
  let failedCount = 0;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];

    try {
      const payload = await postDraft(options.baseUrl, item);
      const draft = payload.draft;
      results.push(draft);
      console.log(
        `[${index + 1}/${items.length}] ${draft.duplicate ? "duplicate" : "created"}: ${draft.slug} (${draft.status})`
      );
    } catch (error) {
      console.error(`[${index + 1}/${items.length}] failed: ${item.headline}`);
      console.error(error.message || error);
      failedCount += 1;
    }
  }

  const createdCount = results.filter((item) => !item.duplicate).length;
  const duplicateCount = results.filter((item) => item.duplicate).length;
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
    message: `Feed ingestion ${status}.`
  });
  await disconnectIngestionRunStore();
}

main().catch((error) => {
  Promise.resolve()
    .then(async () => {
      if (global.__INGEST_FEED_RUN_ID__) {
        await failIngestionRun(global.__INGEST_FEED_RUN_ID__, {
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
