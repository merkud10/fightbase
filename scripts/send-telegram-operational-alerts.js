#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function parseArgs(argv) {
  const options = {
    limit: 5,
    dryRun: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--limit" && argv[index + 1]) {
      options.limit = Math.max(1, Number(argv[index + 1]) || options.limit);
      index += 1;
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
    }
  }

  return options;
}

function escapeTelegram(value) {
  return String(value || "").replace(/[&<>]/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    return "&gt;";
  });
}

function truncateText(value, maxLength = 280) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) {
    return clean;
  }

  return `${clean.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function formatMoscowDateTime(value) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function buildEventMessage(event) {
  const parts = [
    `🚨 <b>FightBase operational alert</b>`,
    "",
    `<b>${escapeTelegram(event.category)}</b>`,
    escapeTelegram(event.message)
  ];

  if (event.source) {
    parts.push(`Source: ${escapeTelegram(event.source)}`);
  }

  if (event.path) {
    parts.push(`Path: ${escapeTelegram(event.path)}`);
  }

  if (event.ipAddress) {
    parts.push(`IP: ${escapeTelegram(event.ipAddress)}`);
  }

  if (event.meta) {
    parts.push(`Meta: ${escapeTelegram(truncateText(event.meta, 220))}`);
  }

  parts.push(`Время (МСК): ${escapeTelegram(formatMoscowDateTime(event.createdAt))}`);

  return parts.join("\n");
}

async function loadPendingAlerts(limit) {
  return prisma.systemEvent.findMany({
    where: {
      level: "error",
      telegramAlertedAt: null
    },
    orderBy: { createdAt: "asc" },
    take: limit
  });
}

async function markAlerted(ids) {
  if (ids.length === 0) {
    return;
  }

  await prisma.systemEvent.updateMany({
    where: {
      id: {
        in: ids
      }
    },
    data: {
      telegramAlertedAt: new Date()
    }
  });
}

async function recordAlertDeliveryEvent(level, message, meta) {
  await prisma.systemEvent.create({
    data: {
      level,
      category: "alerts.telegram",
      message,
      source: "scripts/send-telegram-operational-alerts",
      meta: meta ? JSON.stringify(meta) : null,
      telegramAlertedAt: new Date()
    }
  });
}

async function sendTelegramMessage(token, chatId, text) {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram API error: ${response.status} ${body}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ALERTS_CHAT_ID || process.env.TELEGRAM_CHANNEL_ID;

  if (!token || !chatId) {
    console.log("[alerts] Telegram alerts are not configured, skipping.");
    return;
  }

  const events = await loadPendingAlerts(options.limit);
  const alertedIds = [];

  for (const event of events) {
    const text = buildEventMessage(event);

    if (!options.dryRun) {
      await sendTelegramMessage(token, chatId, text);
    }

    alertedIds.push(event.id);
    console.log(`[alerts] ${event.category} -> telegram`);
  }

  if (!options.dryRun) {
    await markAlerted(alertedIds);
    if (alertedIds.length > 0) {
      await recordAlertDeliveryEvent("info", "Operational alerts sent to Telegram", {
        count: alertedIds.length
      });
    }
  }

  console.log(`[alerts] processed: ${alertedIds.length}`);
}

main()
  .catch(async (error) => {
    const message = error?.message || String(error);
    console.error(message);

    try {
      await recordAlertDeliveryEvent("error", "Telegram alert delivery failed", { error: message });
    } catch {
      // Ignore nested observability failures.
    }

    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
