#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

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
  const feedPath = path.resolve(process.cwd(), options.file);

  if (!fs.existsSync(feedPath)) {
    throw new Error(`Feed file not found: ${feedPath}`);
  }

  const raw = fs.readFileSync(feedPath, "utf8");
  const items = JSON.parse(raw);

  if (!Array.isArray(items)) {
    throw new Error("Feed file must contain a JSON array");
  }

  items.forEach((item, index) => assertFeedItem(item, index));

  console.log(`Feed items: ${items.length}`);
  console.log(`Target: ${options.baseUrl}`);
  console.log(`Mode: ${options.dryRun ? "dry-run" : "write"}`);

  if (options.dryRun) {
    items.forEach((item, index) => {
      console.log(`[DRY RUN ${index + 1}] ${item.headline}`);
    });
    return;
  }

  const results = [];

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
      throw error;
    }
  }

  const createdCount = results.filter((item) => !item.duplicate).length;
  const duplicateCount = results.filter((item) => item.duplicate).length;

  console.log("");
  console.log("Summary");
  console.log(`Created: ${createdCount}`);
  console.log(`Duplicates: ${duplicateCount}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
