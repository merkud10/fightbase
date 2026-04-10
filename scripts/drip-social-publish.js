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

  const tgSummary = data.telegram?.articleId
    ? `${data.telegram.sent ? "sent" : "pending"}: ${data.telegram.title || data.telegram.articleId}`
    : "none";
  const vkSummary = data.vk?.articleId
    ? `${data.vk.sent ? "sent" : "pending"}: ${data.vk.title || data.vk.articleId}`
    : "none";

  console.log(`[drip] TG ${tgSummary}`);
  console.log(`[drip] VK ${vkSummary}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
