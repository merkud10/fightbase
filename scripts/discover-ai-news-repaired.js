#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const path = require("node:path");

function runNodeScript(scriptName, args) {
  const scriptPath = path.resolve(process.cwd(), "scripts", scriptName);
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: "pipe"
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const forwardedArgs = process.argv.slice(2);
const dryRun = forwardedArgs.includes("--dry-run");

runNodeScript("discover-ai-news.js", forwardedArgs);

if (!dryRun) {
  runNodeScript("repair-editorial-quality.js", []);
  runNodeScript("send-pending-push-notifications.js", ["--type", "articles"]);
}
