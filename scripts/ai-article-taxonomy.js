const fs = require("fs");
const path = require("path");

const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434/api/generate";
const DEFAULT_MODEL = "qwen35-aggressive:latest";
const MAX_BODY_LENGTH = 5000;

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

function readEnv(name, fallback = "") {
  return process.env[name] || readEnvValueFromFile(name) || fallback;
}

function sanitizeJsonPayload(value) {
  const raw = String(value || "").trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced?.[1]?.trim() ?? raw;
}

function parseJsonObject(value) {
  const sanitized = sanitizeJsonPayload(value);

  try {
    return JSON.parse(sanitized);
  } catch {
    const start = sanitized.indexOf("{");
    const end = sanitized.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(sanitized.slice(start, end + 1));
    }

    throw new Error("Invalid JSON returned by taxonomy model");
  }
}

function uniqueStrings(values) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

function buildPrompt(input) {
  const promotionsBlock = input.promotions.map((item) => `- ${item.slug}: ${item.shortName} / ${item.name}`).join("\n");
  const fightersBlock = input.fighters
    .map((fighter) => `- ${fighter.slug}: ${fighter.name}${fighter.nameRu ? ` / ${fighter.nameRu}` : ""}${fighter.nickname ? ` / ${fighter.nickname}` : ""}`)
    .join("\n");

  return [
    "You are an MMA content classifier for FightBase Media.",
    "Classify the article into one of these content types only: news, interview, analysis.",
    "news = rumors, bookings, event announcements, results, tournament updates, roster moves.",
    "interview = direct fighter or coach quotes, Q&A, press conference, reactions, source-led quote pieces.",
    "analysis = predictions, fight previews, tactical breakdowns, matchup analysis, betting-style previews, key factors.",
    "Choose one promotion slug from the allowed list when the league is clear. Otherwise return an empty string.",
    "Return fighter slugs only from the allowed fighter list. Include up to 6 relevant fighters actually mentioned in the article.",
    "Do not invent fighters or promotions.",
    "Return strict JSON with keys contentType, promotionSlug, fighterSlugs, confidence, reason.",
    "",
    "Allowed promotions:",
    promotionsBlock,
    "",
    "Allowed fighters:",
    fightersBlock,
    "",
    `Title: ${input.headline}`,
    `Source label: ${input.sourceLabel}`,
    `Source URL: ${input.sourceUrl}`,
    "Body:",
    String(input.body || "").slice(0, MAX_BODY_LENGTH)
  ].join("\n");
}

async function classifyArticleWithAi(input) {
  const url = readEnv("OLLAMA_URL", DEFAULT_OLLAMA_URL);
  const model = readEnv("OLLAMA_MODEL", DEFAULT_MODEL);
  const payload = {
    model,
    stream: false,
    format: "json",
    prompt: buildPrompt(input),
    options: {
      temperature: 0.1
    }
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  let response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Ollama taxonomy request timed out");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Ollama taxonomy request failed with HTTP ${response.status}: ${await response.text()}`);
  }

  const raw = await response.json();
  const parsed = parseJsonObject(raw?.response || "{}");

  return {
    contentType: ["news", "interview", "analysis"].includes(parsed.contentType) ? parsed.contentType : "news",
    promotionSlug: String(parsed.promotionSlug || "").trim(),
    fighterSlugs: uniqueStrings(Array.isArray(parsed.fighterSlugs) ? parsed.fighterSlugs : []),
    confidence: Number(parsed.confidence) || 0,
    reason: String(parsed.reason || "").trim()
  };
}

module.exports = {
  classifyArticleWithAi
};
