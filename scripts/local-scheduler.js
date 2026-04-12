#!/usr/bin/env node

/**
 * Локальный планировщик регламентных операций.
 * Запускается параллельно с dev-сервером:
 *   node scripts/local-scheduler.js
 *
 * Расписание:
 *   - Новости:                каждые 6 часов
 *   - Турниры + бои + коэффициенты: каждые 24 часа
 *   - Ростер бойцов:          каждые 7 дней
 *
 * После каждой успешной задачи отправляет уведомление в Telegram.
 * Требует запущенный dev-сервер на localhost:3000.
 */

const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const HOUR = 60 * 60 * 1000;

const MINUTE = 60 * 1000;

const SCHEDULE = [
  {
    name: "news",
    label: "✅ Новости обновлены",
    intervalMs: 6 * HOUR,
    scripts: ["discover-weekly-news.js"]
  },
  {
    name: "events",
    label: "✅ Турниры + бои + прогнозы обновлены",
    intervalMs: 24 * HOUR,
    scripts: ["sync-upcoming-pipeline.js"]
  },
  {
    name: "roster",
    label: "✅ Бойцы обновлены",
    intervalMs: 7 * 24 * HOUR,
    scripts: ["sync-ufc-roster.js"]
  },
  {
    name: "social-drip",
    label: "",
    intervalMs: 30 * MINUTE,
    scripts: ["drip-social-publish.js"],
    silent: true
  }
];

function readEnvFile() {
  try {
    const envPath = path.join(process.cwd(), ".env");
    const contents = fs.readFileSync(envPath, "utf8");
    const env = {};
    for (const line of contents.split("\n")) {
      const match = line.match(/^([A-Z_][A-Z0-9_]*)="?([^"]*)"?$/);
      if (match) {
        env[match[1]] = match[2].trim();
      }
    }
    return env;
  } catch {
    return {};
  }
}

function getEnv(name) {
  return process.env[name] || readEnvFile()[name] || "";
}

function timestamp() {
  return new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
}

function runScript(scriptName) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.resolve(process.cwd(), "scripts", scriptName);
    console.log(`[${timestamp()}] > ${scriptName}`);

    const child = spawn(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: { ...process.env, ...readEnvFile() }
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${scriptName} exited with code ${code}`));
      }
    });

    child.on("error", reject);
  });
}

async function sendTelegram(text) {
  const token = getEnv("TELEGRAM_BOT_TOKEN");
  const chatId = getEnv("TELEGRAM_ALERTS_CHAT_ID") || getEnv("TELEGRAM_CHANNEL_ID");

  if (!token || !chatId) {
    console.log(`[${timestamp()}] [telegram] not configured, skipping`);
    return;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_notification: true
      })
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`[${timestamp()}] [telegram] error ${response.status}: ${body}`);
    }
  } catch (error) {
    console.error(`[${timestamp()}] [telegram] ${error.message || error}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTask(task) {
  console.log(`\n[${timestamp()}] === ${task.name.toUpperCase()} ===`);

  try {
    for (const script of task.scripts) {
      await runScript(script);
    }
    console.log(`[${timestamp()}] ${task.name} completed`);
    if (!task.silent && task.label) {
      await sendTelegram(task.label);
    }
  } catch (error) {
    console.error(`[${timestamp()}] ${task.name} FAILED: ${error.message || error}`);
    if (!task.silent) {
      await sendTelegram(`❌ ${task.name} failed: ${error.message || error}`);
    }
  }
}

async function main() {
  console.log(`[${timestamp()}] Local scheduler started`);
  console.log(`  News:         every 6h`);
  console.log(`  Events:       every 24h`);
  console.log(`  Roster:       every 7d`);
  console.log(`  Social drip:  every 30min`);
  console.log();

  // Run news immediately on start
  await runTask(SCHEDULE[0]);

  // Set up intervals
  for (const task of SCHEDULE) {
    setInterval(() => runTask(task), task.intervalMs);
  }

  // Keep process alive
  process.on("SIGINT", () => {
    console.log(`\n[${timestamp()}] Scheduler stopped`);
    process.exit(0);
  });
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
