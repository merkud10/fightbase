const fs = require("fs");
const path = require("path");

function stripTags(input) {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeValue(input) {
  return stripTags(input).replace(/\s+/g, " ").trim();
}

function matchMeta(html, key) {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${key}["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+name=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${key}["'][^>]*>`, "i")
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return decodeValue(match[1]);
    }
  }

  return "";
}

function matchTag(html, tagName) {
  const match = html.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match?.[1] ? decodeValue(match[1]) : "";
}

function matchParagraphs(html, limit = 4) {
  const paragraphs = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => decodeValue(match[1]))
    .filter((text) => text.length > 40)
    .slice(0, limit);

  return paragraphs.join("\n\n");
}

function parseGenericDocument(entry, html) {
  const headline =
    matchMeta(html, "og:title") ||
    matchTag(html, "h1") ||
    matchTag(html, "title") ||
    entry.fallbackHeadline ||
    "Untitled source item";

  const summary = matchMeta(html, "description") || matchMeta(html, "og:description");
  const paragraphs = matchParagraphs(html, 5);
  const body = [summary, paragraphs].filter(Boolean).join("\n\n").trim() || stripTags(html).slice(0, 800);

  return {
    headline,
    body
  };
}

function parseUfcDocument(entry, html) {
  return parseGenericDocument(entry, html);
}

function parseOneDocument(entry, html) {
  return parseGenericDocument(entry, html);
}

const parserRegistry = {
  generic: parseGenericDocument,
  ufc: parseUfcDocument,
  one: parseOneDocument
};

async function loadDocument(entry, cwd) {
  if (entry.fixturePath) {
    const fixturePath = path.resolve(cwd, entry.fixturePath);
    return fs.readFileSync(fixturePath, "utf8");
  }

  if (!entry.url) {
    throw new Error("Fetcher entry requires either url or fixturePath");
  }

  const response = await fetch(entry.url, {
    headers: {
      "User-Agent": "FightBaseIngestionBot/0.1 (+local-dev)"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${entry.url}: HTTP ${response.status}`);
  }

  return response.text();
}

async function fetchSourceEntry(entry, cwd) {
  const parserName = entry.parser || "generic";
  const parser = parserRegistry[parserName];

  if (!parser) {
    throw new Error(`Unknown parser "${parserName}"`);
  }

  const html = await loadDocument(entry, cwd);
  const parsed = parser(entry, html);

  return {
    ...entry,
    headline: parsed.headline,
    body: parsed.body
  };
}

module.exports = {
  fetchSourceEntry
};
