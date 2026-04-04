#!/usr/bin/env node

const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { claimNextBackgroundJob, completeBackgroundJob, failBackgroundJob, disconnectBackgroundJobStore } = require("./background-job-store");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const execFileAsync = promisify(execFile);

const JOB_SCRIPT_MAP = {
  watchlist: "fetch-source-feed.js",
  "ai-discovery": "discover-ai-news-repaired.js",
  "weekly-analysis": "discover-weekly-analysis.js",
  "sync-odds": "sync-upcoming-pipeline.js",
  "operational-alerts": "send-telegram-operational-alerts.js"
};

function buildArgs(job, baseUrl) {
  const payload = JSON.parse(job.payload || "{}");
  const args = [path.resolve(process.cwd(), "scripts", JOB_SCRIPT_MAP[job.type])];

  if (job.type === "watchlist") {
    args.push("--base-url", payload.baseUrl || baseUrl);
    args.push("--file", payload.file || "ingestion/sample-watchlist.json");
  } else if (job.type === "ai-discovery") {
    args.push("--base-url", payload.baseUrl || baseUrl);
    if (payload.lookbackHours) {
      args.push("--lookback-hours", String(payload.lookbackHours));
    }
    if (payload.limit) {
      args.push("--limit", String(payload.limit));
    }
    if (payload.status) {
      args.push("--status", String(payload.status));
    }
  } else if (job.type === "weekly-analysis") {
    args.push("--base-url", payload.baseUrl || baseUrl);
    if (payload.limit) {
      args.push("--limit-per-source", String(payload.limit));
    }
  } else if (job.type === "operational-alerts") {
    if (payload.limit) {
      args.push("--limit", String(payload.limit));
    }
  }

  if (payload.dryRun && job.type !== "sync-odds") {
    args.push("--dry-run");
  }

  return args;
}

function parseArgs(argv) {
  const options = {
    limit: Number(process.env.BACKGROUND_JOB_BATCH_SIZE || "5") || 5
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--limit" && argv[index + 1]) {
      options.limit = Number(argv[index + 1]) || options.limit;
      index += 1;
    }
  }

  return options;
}

async function main() {
  const baseUrl = process.env.INGEST_BASE_URL || "http://localhost:3000";
  const options = parseArgs(process.argv.slice(2));
  const limit = options.limit;

  let processed = 0;

  try {
    while (processed < limit) {
      const job = await claimNextBackgroundJob();
      if (!job) {
        break;
      }

      const args = buildArgs(job, baseUrl);

      try {
        const result = await execFileAsync(process.execPath, args, {
          cwd: process.cwd(),
          timeout: job.type === "weekly-analysis" ? 480_000 : job.type === "operational-alerts" ? 120_000 : 180_000
        });
        await completeBackgroundJob(job.id, result.stdout?.trim() || result.stderr?.trim() || "ok");
        await prisma.systemEvent.create({
          data: {
            level: "info",
            category: "jobs.worker",
            message: "Background job completed",
            source: "scripts/process-background-jobs",
            meta: JSON.stringify({
              jobId: job.id,
              type: job.type
            })
          }
        });
      } catch (error) {
        await failBackgroundJob(job.id, {
          errorMessage: error && typeof error === "object" && "message" in error ? error.message : "Background job failed"
        });
        await prisma.systemEvent.create({
          data: {
            level: "error",
            category: "jobs.worker",
            message: "Background job failed",
            source: "scripts/process-background-jobs",
            meta: JSON.stringify({
              jobId: job.id,
              type: job.type,
              error: error && typeof error === "object" && "message" in error ? error.message : "Background job failed"
            })
          }
        });
      }

      processed += 1;
    }

    console.log(`Processed background jobs: ${processed}`);
  } finally {
    await prisma.$disconnect();
    await disconnectBackgroundJobStore();
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
