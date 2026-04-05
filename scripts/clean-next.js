#!/usr/bin/env node
/**
 * Удаляет кэш сборки Next.js (частая причина "Cannot find module './NNNN.js'" и Internal Server Error).
 */
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
for (const name of [".next", path.join("node_modules", ".cache")]) {
  const target = path.join(root, name);
  try {
    fs.rmSync(target, { recursive: true, force: true });
    console.log("removed:", name);
  } catch (error) {
    console.warn("skip:", name, error instanceof Error ? error.message : error);
  }
}
