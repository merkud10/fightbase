#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const path = require("node:path");

function runScript(scriptName, args = []) {
  const scriptPath = path.join(process.cwd(), "scripts", scriptName);
  console.log(`\n> ${scriptName} ${args.join(" ")}`.trim());
  execFileSync(process.execPath, [scriptPath, ...args], {
    cwd: process.cwd(),
    stdio: "inherit"
  });
}

function parseArgs(argv) {
  const args = [];

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    args.push(current);

    if (current.startsWith("--") && argv[index + 1] && !argv[index + 1].startsWith("--")) {
      args.push(argv[index + 1]);
      index += 1;
    }
  }

  return args;
}

function main() {
  const forwardedArgs = parseArgs(process.argv.slice(2));
  runScript("sync-upcoming-events.js", forwardedArgs);
  runScript("sync-event-fights.js", forwardedArgs);
  runScript("sync-fight-odds.js");
}

main();
