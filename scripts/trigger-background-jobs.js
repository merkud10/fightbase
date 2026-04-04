#!/usr/bin/env node

const { getInternalApiSecret } = require("./internal-api");

function parseArgs(argv) {
  const options = {
    baseUrl: process.env.INGEST_BASE_URL || "http://localhost:3000",
    secret: getInternalApiSecret(),
    limit: Number(process.env.BACKGROUND_JOB_BATCH_SIZE || "5") || 5
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--base-url" && argv[index + 1]) {
      options.baseUrl = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--secret" && argv[index + 1]) {
      options.secret = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--limit" && argv[index + 1]) {
      options.limit = Number(argv[index + 1]) || options.limit;
      index += 1;
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!options.secret) {
    throw new Error("Missing internal API secret. Pass --secret or set INTERNAL_API_SECRET.");
  }

  const response = await fetch(`${options.baseUrl.replace(/\/$/, "")}/api/cron/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-api-secret": options.secret
    },
    body: JSON.stringify({
      limit: options.limit
    })
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }

  console.log(payload.stdout || "Background jobs processor finished.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
