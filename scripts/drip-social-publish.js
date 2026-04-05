#!/usr/bin/env node

const { parseArgs } = require("./fighter-import-utils");

const args = parseArgs(process.argv.slice(2));
const baseUrl = String(args["base-url"] || process.env.INGEST_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const secret = process.env.INGEST_CRON_SECRET || process.env.INTERNAL_API_SECRET || "";

async function main() {
  const url = `${baseUrl}/api/cron/drip-social`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret ? { "x-internal-api-secret": secret } : {})
    },
    body: JSON.stringify({})
  });

  const data = await response.json();

  if (!response.ok) {
    console.error(`[drip] API error ${response.status}: ${data.error || "unknown"}`);
    process.exit(1);
  }

  if (!data.published) {
    console.log("[drip] No articles pending social publish.");
    return;
  }

  console.log(`[drip] Published: ${data.title}`);
  console.log(`[drip] TG: ${data.telegram ? "sent" : "skipped"}, VK: ${data.vk ? "sent" : "skipped"}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
