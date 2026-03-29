#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function readEnvValueFromFile(name) {
  try {
    const envPath = path.join(process.cwd(), ".env");
    const contents = fs.readFileSync(envPath, "utf8");
    const match = contents.match(new RegExp(`^${name}="?([^"\\r\\n]+)"?$`, "m"));
    return match?.[1]?.trim() || "";
  } catch {
    return "";
  }
}

function getEnvValue(name, fallback = "") {
  return process.env[name] || readEnvValueFromFile(name) || fallback;
}

function looksRussian(value) {
  return /[А-Яа-яЁё]/.test(value);
}

function sanitizeJsonPayload(value) {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced?.[1]?.trim() ?? value.trim();
}

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const transport = target.protocol === "https:" ? https : http;

    const request = transport.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body).toString()
        }
      },
      (response) => {
        const chunks = [];

        response.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        response.on("end", () => {
          const payload = Buffer.concat(chunks).toString("utf8");

          if ((response.statusCode ?? 500) >= 400) {
            reject(new Error(`Request failed with HTTP ${response.statusCode}: ${payload}`));
            return;
          }

          resolve(payload);
        });
      }
    );

    request.setTimeout(120000, () => {
      request.destroy(new Error("Request timed out"));
    });

    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

async function localizeWithOllama(prompt) {
  const url = getEnvValue("OLLAMA_URL", "http://127.0.0.1:11434/api/generate");
  const model = getEnvValue("OLLAMA_MODEL", "aya:8b-23");
  const rawPayload = await postJson(
    url,
    JSON.stringify({
      model,
      stream: false,
      format: "json",
      prompt
    })
  );

  const payload = JSON.parse(rawPayload);
  return JSON.parse(sanitizeJsonPayload(payload.response || ""));
}

async function localizeArticle(article) {
  if (looksRussian(`${article.title} ${article.excerpt} ${article.meaning}`)) {
    return false;
  }

  const prompt = [
    "You are translating MMA newsroom content into Russian.",
    "Return strict JSON with keys title, excerpt, meaning, sectionHeading, sectionBody.",
    "Keep facts intact, use natural Russian MMA media style, no markdown.",
    `Title: ${article.title}`,
    `Excerpt: ${article.excerpt}`,
    `Meaning: ${article.meaning}`,
    `Section heading: ${article.sections[0]?.heading ?? "Article"}`,
    "Section body:",
    article.sections[0]?.body ?? ""
  ].join("\n");

  const localized = await localizeWithOllama(prompt);

  await prisma.article.update({
    where: { id: article.id },
    data: {
      title: localized.title?.trim() || article.title,
      excerpt: localized.excerpt?.trim() || article.excerpt,
      meaning: localized.meaning?.trim() || article.meaning,
      sections: article.sections[0]
        ? {
            update: {
              where: { id: article.sections[0].id },
              data: {
                heading: localized.sectionHeading?.trim() || article.sections[0].heading,
                body: localized.sectionBody?.trim() || article.sections[0].body
              }
            }
          }
        : undefined
    }
  });

  return true;
}

async function localizeEvent(event) {
  if (looksRussian(event.summary)) {
    return false;
  }

  const prompt = [
    "Translate this MMA event summary into natural Russian.",
    "Return strict JSON with key summary.",
    `Name: ${event.name}`,
    `Summary: ${event.summary}`
  ].join("\n");

  const localized = await localizeWithOllama(prompt);

  await prisma.event.update({
    where: { id: event.id },
    data: {
      summary: localized.summary?.trim() || event.summary
    }
  });

  return true;
}

async function localizeFighter(fighter) {
  if (looksRussian(fighter.bio)) {
    return false;
  }

  const prompt = [
    "Translate this MMA fighter bio into natural Russian.",
    "Return strict JSON with key bio.",
    `Name: ${fighter.name}`,
    `Bio: ${fighter.bio}`
  ].join("\n");

  const localized = await localizeWithOllama(prompt);

  await prisma.fighter.update({
    where: { id: fighter.id },
    data: {
      bio: localized.bio?.trim() || fighter.bio
    }
  });

  return true;
}

async function main() {
  const [articles, events, fighters] = await Promise.all([
    prisma.article.findMany({
      include: {
        sections: {
          orderBy: { sortOrder: "asc" },
          take: 1
        }
      }
    }),
    prisma.event.findMany(),
    prisma.fighter.findMany()
  ]);

  let articleUpdates = 0;
  for (const article of articles) {
    if (await localizeArticle(article)) {
      articleUpdates += 1;
      console.log(`Localized article: ${article.title}`);
    }
  }

  let eventUpdates = 0;
  for (const event of events) {
    if (await localizeEvent(event)) {
      eventUpdates += 1;
      console.log(`Localized event: ${event.name}`);
    }
  }

  let fighterUpdates = 0;
  for (const fighter of fighters) {
    if (await localizeFighter(fighter)) {
      fighterUpdates += 1;
      console.log(`Localized fighter: ${fighter.name}`);
    }
  }

  console.log(`Articles updated: ${articleUpdates}`);
  console.log(`Events updated: ${eventUpdates}`);
  console.log(`Fighters updated: ${fighterUpdates}`);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
