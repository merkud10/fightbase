#!/usr/bin/env node

function parseArgs(argv) {
  const options = {
    baseUrl: process.env.INGEST_BASE_URL || "http://localhost:3000",
    file: "ingestion/sample-watchlist.json",
    dryRun: false,
    secret: process.env.INGEST_CRON_SECRET || ""
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

    if (arg === "--dry-run") {
      options.dryRun = true;
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!options.secret) {
    throw new Error("Missing cron secret. Pass --secret or set INGEST_CRON_SECRET.");
  }

  const response = await fetch(`${options.baseUrl.replace(/\/$/, "")}/api/cron/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ingest-cron-secret": options.secret
    },
    body: JSON.stringify({
      file: options.file,
      dryRun: options.dryRun
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
