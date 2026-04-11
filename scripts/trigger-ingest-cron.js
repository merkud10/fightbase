#!/usr/bin/env node

const { getInternalApiSecret } = require("./internal-api");

function parseArgs(argv) {
  const options = {
    baseUrl: process.env.INGEST_BASE_URL || "http://localhost:3000",
    file: "ingestion/sample-watchlist.json",
    dryRun: false,
    secret: getInternalApiSecret(),
    job: process.env.INGEST_CRON_JOB || "weekly-news",
    days: Number(process.env.WEEKLY_NEWS_DAYS || "1") || 1,
    limitPerSource: Number(process.env.WEEKLY_NEWS_LIMIT_PER_SOURCE || "8") || 8,
    target: process.env.WEEKLY_NEWS_TARGET || "all",
    sourceLabel: process.env.WEEKLY_NEWS_SOURCE_LABEL || "",
    status: process.env.AI_DISCOVERY_STATUS || "published"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--base-url" && argv[index + 1]) {
      options.baseUrl = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--file" && argv[index + 1]) {
      options.file = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--secret" && argv[index + 1]) {
      options.secret = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--job" && argv[index + 1]) {
      options.job = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--days" && argv[index + 1]) {
      options.days = Number(argv[index + 1]) || options.days;
      index += 1;
      continue;
    }

    if (arg === "--limit-per-source" && argv[index + 1]) {
      options.limitPerSource = Number(argv[index + 1]) || options.limitPerSource;
      index += 1;
      continue;
    }

    if (arg === "--target" && argv[index + 1]) {
      options.target = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--source-label" && argv[index + 1]) {
      options.sourceLabel = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--status" && argv[index + 1]) {
      options.status = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!options.secret) {
    throw new Error("Missing internal API secret. Pass --secret or set INTERNAL_API_SECRET.");
  }

  const response = await fetch(`${options.baseUrl.replace(/\/$/, "")}/api/cron/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-api-secret": options.secret
    },
    body: JSON.stringify({
      job: options.job,
      file: options.file,
      dryRun: options.dryRun,
      days: options.days,
      limitPerSource: options.limitPerSource,
      target: options.target,
      sourceLabel: options.sourceLabel || undefined,
      status: options.status
    })
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }

  console.log(payload.stdout || "Cron trigger finished with no output.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
