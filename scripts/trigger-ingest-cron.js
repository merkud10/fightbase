#!/usr/bin/env node

const { getInternalApiSecret } = require("./internal-api");

function parseArgs(argv) {
  const options = {
    baseUrl: process.env.INGEST_BASE_URL || "http://localhost:3000",
    file: "ingestion/sample-watchlist.json",
    dryRun: false,
    secret: getInternalApiSecret(),
    job: process.env.INGEST_CRON_JOB || "ai-discovery",
    lookbackHours: Number(process.env.AI_DISCOVERY_LOOKBACK_HOURS || "8") || 8,
    limit: Number(process.env.AI_DISCOVERY_ITEM_LIMIT || "8") || 8,
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
      lookbackHours: options.lookbackHours,
      limit: options.limit,
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
