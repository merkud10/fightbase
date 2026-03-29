#!/usr/bin/env node

const { execFileSync } = require("child_process");
const path = require("path");

const cwd = path.resolve(__dirname, "..");
const commands = [
  ["node", ["scripts/sync-ufc-roster.js"]],
  ["node", ["scripts/sync-pfl-roster.js"]],
  ["node", ["scripts/sync-one-roster.js"]],
  ["node", ["scripts/enrich-fighter-profiles.js"]]
];

for (const [command, args] of commands) {
  console.log(`Running ${command} ${args.join(" ")}`);
  execFileSync(command, args, {
    cwd,
    stdio: "inherit"
  });
}

console.log("English fighter bio backfill complete.");
