#!/usr/bin/env node
/**
 * Запуск production-сервера для output: "standalone".
 * Копирует .next/static и public в каталог standalone (как в Dockerfile), затем node server.js.
 * На Windows для копирования используется robocopy — fs.cpSync на длинных/OneDrive-путях иногда падает.
 *
 * Важно: процесс server.js имеет cwd = .next/standalone, поэтому Next не читает .env из корня репозитория.
 * Перед spawn подгружаем те же файлы, что и `next start` (.env → … → .env.production.local).
 */
const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const dotenv = require("dotenv");

const root = path.resolve(__dirname, "..");

/** Порядок как у Next.js для production (последние файлы перекрывают предыдущие). */
function loadEnvFromProjectRoot() {
  const files = [".env", ".env.local", ".env.production", ".env.production.local"];
  for (const name of files) {
    const full = path.join(root, name);
    if (fs.existsSync(full)) {
      dotenv.config({ path: full, override: true });
    }
  }
}

loadEnvFromProjectRoot();
const standalone = path.join(root, ".next", "standalone");
const serverJs = path.join(standalone, "server.js");

if (!fs.existsSync(serverJs)) {
  console.error("Сначала выполните `npm run build` — нет файла .next/standalone/server.js");
  process.exit(1);
}

const staticSrc = path.join(root, ".next", "static");
const staticDest = path.join(standalone, ".next", "static");
const publicSrc = path.join(root, "public");
const publicDest = path.join(standalone, "public");

function syncTree(src, dest) {
  if (!fs.existsSync(src)) {
    console.error("Нет каталога:", src);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.rmSync(dest, { recursive: true, force: true });

  if (process.platform === "win32") {
    const r = spawnSync(
      "robocopy",
      [src, dest, "/E", "/NFL", "/NDL", "/NJH", "/NJS", "/NC", "/NS"],
      { stdio: "inherit", windowsHide: true }
    );
    const code = r.status ?? 1;
    if (code >= 8) {
      console.error("robocopy завершился с кодом", code);
      process.exit(1);
    }
  } else {
    fs.cpSync(src, dest, { recursive: true });
  }
}

syncTree(staticSrc, staticDest);
syncTree(publicSrc, publicDest);

if (!process.env.DATABASE_URL?.trim()) {
  console.warn(
    "Внимание: DATABASE_URL не задан (проверьте .env в корне проекта). Без БД страницы с данными из Prisma не откроются."
  );
}

const child = spawn(process.execPath, ["server.js"], {
  cwd: standalone,
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "production" }
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
