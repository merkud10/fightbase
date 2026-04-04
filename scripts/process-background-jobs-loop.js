#!/usr/bin/env node

const { spawn } = require("node:child_process");

function parseArgs(argv) {
  const options = {
    intervalMs: Number(process.env.BACKGROUND_JOB_POLL_INTERVAL_MS || "30000") || 30000,
    batchSize: Number(process.env.BACKGROUND_JOB_BATCH_SIZE || "5") || 5
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--interval-ms" && argv[index + 1]) {
      options.intervalMs = Number(argv[index + 1]) || options.intervalMs;
      index += 1;
      continue;
    }

    if (arg === "--batch-size" && argv[index + 1]) {
      options.batchSize = Number(argv[index + 1]) || options.batchSize;
      index += 1;
      continue;
    }
  }

  return options;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runOnce(batchSize) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/process-background-jobs.js", "--limit", String(batchSize)], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: process.env
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Background jobs worker exited with code ${code}`));
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  while (true) {
    try {
      await runOnce(options.batchSize);
    } catch (error) {
      console.error(error?.message || error);
    }

    await sleep(options.intervalMs);
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
