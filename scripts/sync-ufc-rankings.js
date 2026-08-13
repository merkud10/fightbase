#!/usr/bin/env node

const { getInternalApiSecret } = require("./internal-api");

function parseArgs(argv) {
  const options = {
    baseUrl: process.env.INGEST_BASE_URL || "http://localhost:3000",
    secret: getInternalApiSecret()
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
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.secret) {
    throw new Error("Missing internal API secret. Pass --secret or set INTERNAL_API_SECRET.");
  }

  const response = await fetch(`${options.baseUrl.replace(/\/$/, "")}/api/cron/rankings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-api-secret": options.secret
    },
    body: "{}",
    signal: AbortSignal.timeout(30_000)
  });
  const rawBody = await response.text();
  let payload = {};

  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    throw new Error(`Ranking refresh returned invalid JSON (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    const suffix = payload.preserved ? " The previous snapshot was preserved." : "";
    throw new Error(`${payload.error || payload.reason || `HTTP ${response.status}`}.${suffix}`);
  }

  console.log(
    `UFC rankings refreshed: ${payload.groupCount || 0} groups, fetched at ${payload.fetchedAt || "unknown"}.`
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
