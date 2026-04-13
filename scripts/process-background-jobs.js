#!/usr/bin/env node

const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { claimNextBackgroundJob, completeBackgroundJob, failBackgroundJob, disconnectBackgroundJobStore } = require("./background-job-store");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const execFileAsync = promisify(execFile);

const JOB_SCRIPT_MAP = {
  "weekly-news": "discover-weekly-news.js",
  "ai-discovery": "discover-weekly-news.js",
  "sync-odds": "sync-upcoming-pipeline.js",
  "sync-roster": "sync-ufc-roster.js",
  "operational-alerts": "send-telegram-operational-alerts.js"
};

function buildArgs(job, baseUrl) {
  const payload = JSON.parse(job.payload || "{}");
  const args = [path.resolve(process.cwd(), "scripts", JOB_SCRIPT_MAP[job.type])];

  if (job.type === "weekly-news" || job.type === "ai-discovery") {
    args.push("--base-url", payload.baseUrl || baseUrl);
    if (payload.days) {
      args.push("--days", String(payload.days));
    }
    if (payload.limitPerSource) {
      args.push("--limit-per-source", String(payload.limitPerSource));
    }
    if (payload.target) {
      args.push("--target", String(payload.target));
    }
    if (payload.sourceLabel) {
      args.push("--source-label", String(payload.sourceLabel));
    }
    if (!payload.days && payload.lookbackHours) {
      args.push("--days", String(Math.max(1, Math.ceil(Number(payload.lookbackHours) / 24))));
    }
    if (!payload.limitPerSource && payload.limit) {
      args.push("--limit-per-source", String(payload.limit));
    }
  } else if (job.type === "sync-roster") {
    if (payload.limit) {
      args.push("--limit", String(payload.limit));
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
          timeout: job.type === "operational-alerts" ? 120_000 : job.type === "sync-roster" ? 900_000 : job.type === "weekly-news" || job.type === "ai-discovery" || job.type === "sync-odds" ? 600_000 : 180_000
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
