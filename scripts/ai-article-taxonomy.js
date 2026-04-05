const fs = require("fs");
const path = require("path");

const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434/api/generate";
const DEFAULT_OLLAMA_MODEL = "qwen35-aggressive:latest";
const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-chat";
const MAX_BODY_LENGTH = 2800;
const MAX_FIGHTER_CANDIDATES = 24;
const MAX_RETURNED_FIGHTERS = 6;

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

function getAiProvider() {
  return readEnv("AI_PROVIDER", "").toLowerCase();
}

function getDeepSeekApiKey() {
  return readEnv("DEEPSEEK_API_KEY");
}

function getDeepSeekBaseUrl() {
  return readEnv("DEEPSEEK_BASE_URL", DEFAULT_DEEPSEEK_BASE_URL);
}

function getDeepSeekModel() {
  return readEnv("DEEPSEEK_MODEL", DEFAULT_DEEPSEEK_MODEL);
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
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function normalizeForMatch(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-ZА-Яа-я0-9]+/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countAliasMatches(haystack, alias) {
  const normalizedAlias = normalizeForMatch(alias);
  if (!normalizedAlias || normalizedAlias.length < 3) {
    return 0;
  }

  const pattern = new RegExp(`(^|\\s)${escapeRegex(normalizedAlias)}(?=$|\\s)`, "g");
  return haystack.match(pattern)?.length || 0;
}

function tokenizeNormalized(value) {
  return normalizeForMatch(value).split(" ").filter(Boolean);
}

function containsCyrillic(value) {
  return /[А-Яа-яЁё]/.test(String(value || ""));
}

function extractMentionPhrases(value) {
  const source = String(value || "");
  const patterns = [
    /\b[A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)?(?:\s+[A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)?){1,2}\b/g,
    /\b[А-ЯЁ][а-яё]+(?:[-'][А-ЯЁ]?[а-яё]+)?(?:\s+[А-ЯЁ][а-яё]+(?:[-'][А-ЯЁ]?[а-яё]+)?){1,2}\b/g
  ];

  return uniqueStrings(
    patterns.flatMap((pattern) => Array.from(source.matchAll(pattern)).map((match) => normalizeForMatch(match[0])))
  );
}

function buildPromotionCandidates(input) {
  const haystack = normalizeForMatch(`${input.sourceLabel} ${input.sourceUrl} ${input.headline} ${input.body}`);
  const scored = input.promotions
    .map((promotion) => {
      const aliases = uniqueStrings([promotion.slug, promotion.shortName, promotion.name]);
      const score = aliases.reduce((sum, alias) => sum + countAliasMatches(haystack, alias) * 3, 0);
      return { ...promotion, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  const inferred = scored[0]?.slug || "";
  const shortlist = scored.slice(0, 3);

  if (shortlist.length > 0) {
    return { inferred, shortlist };
  }

  return {
    inferred: input.promotions.find((promotion) => countAliasMatches(haystack, promotion.shortName) > 0)?.slug || "",
    shortlist: input.promotions.slice(0, 3)
  };
}

function scoreFighterCandidate(haystack, mentionPhrases, fighter) {
  const aliases = uniqueStrings([
    fighter.name,
    containsCyrillic(haystack) ? fighter.nameRu : "",
    fighter.nickname
  ]);
  let score = 0;

  const normalizedSlugAlias = normalizeForMatch(String(fighter.slug || "").replace(/-/g, " "));
  if (mentionPhrases.includes(normalizedSlugAlias)) {
    score += 50;
  }
  if (normalizedSlugAlias) {
    score += countAliasMatches(haystack, normalizedSlugAlias) * 10;
  }

  for (const alias of aliases) {
    const normalizedAlias = normalizeForMatch(alias);
    if (!normalizedAlias) continue;

    if (mentionPhrases.includes(normalizedAlias)) {
      score += 50;
    }

    const words = tokenizeNormalized(normalizedAlias);
    if (words.length >= 2) {
      const fullNameMatches = countAliasMatches(haystack, normalizedAlias);
      score += fullNameMatches * 20;

      const firstName = words[0];
      const lastName = words[words.length - 1];
      const firstNameMatches = firstName.length >= 3 ? countAliasMatches(haystack, firstName) : 0;
      const lastNameMatches = lastName.length >= 4 ? countAliasMatches(haystack, lastName) : 0;

      if (fullNameMatches > 0) {
        score += lastNameMatches * 4;
      } else if (firstNameMatches > 0 && lastNameMatches > 0) {
        score += Math.min(firstNameMatches, lastNameMatches) * 12;
      }

      continue;
    }

    if (fighter.nickname && normalizedAlias === normalizeForMatch(fighter.nickname)) {
      score += countAliasMatches(haystack, normalizedAlias) * 5;
    }
  }

  return score;
}

function buildFighterCandidates(input, inferredPromotionSlug) {
  const haystack = normalizeForMatch(`${input.headline} ${input.body}`);
  const mentionPhrases = extractMentionPhrases(`${input.headline}\n${input.body}`);
  const byPromotion = input.fighters.filter((fighter) => !inferredPromotionSlug || fighter.promotionSlug === inferredPromotionSlug);
  const pool = byPromotion.length >= 8 ? byPromotion : input.fighters;
  const exactMentionMatches = pool.filter((fighter) => {
    const aliases = uniqueStrings([
      fighter.name,
      containsCyrillic(`${input.headline}\n${input.body}`) ? fighter.nameRu : "",
      String(fighter.slug || "").replace(/-/g, " ")
    ]).map((alias) => normalizeForMatch(alias));

    return aliases.some((alias) => alias && mentionPhrases.includes(alias));
  });
  const candidatePool = exactMentionMatches.length > 0 ? exactMentionMatches : pool;

  return candidatePool
    .map((fighter) => ({ fighter, score: scoreFighterCandidate(haystack, mentionPhrases, fighter) }))
    .filter((entry) => entry.score >= 10)
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_FIGHTER_CANDIDATES)
    .map((entry) => entry.fighter);
}

function inferFightersHeuristically(input, inferredPromotionSlug) {
  return buildFighterCandidates(input, inferredPromotionSlug)
    .slice(0, MAX_RETURNED_FIGHTERS)
    .map((fighter) => fighter.slug);
}

function buildPrompt(input) {
  const promotionContext = buildPromotionCandidates(input);
  const fighterCandidates = buildFighterCandidates(input, promotionContext.inferred);
  const promotionsBlock = promotionContext.shortlist.map((item) => `- ${item.slug}: ${item.shortName} / ${item.name}`).join("\n");
  const fightersBlock = fighterCandidates
    .map((fighter) => `- ${fighter.slug}: ${fighter.name}${fighter.nameRu ? ` / ${fighter.nameRu}` : ""}${fighter.nickname ? ` / ${fighter.nickname}` : ""}`)
    .join("\n");

  return {
    prompt: [
      "You are an MMA content classifier for FightBase Media.",
      "Decide whether the story is truly UFC-focused. If it is not truly UFC-focused, return isUfc=false.",
      "Classify the article into one of these content types only: news, interview, analysis, prediction.",
      "news = rumors, bookings, event announcements, results, tournament updates, roster moves.",
      "interview = direct fighter or coach quotes, Q&A, press conference, reactions, source-led quote pieces.",
      "analysis = long-form breakdowns, stylistic conflicts, divisional context, feature analysis.",
      "prediction = fight previews, tactical matchup previews, keys to victory, betting-style previews.",
      "Also assign one or more topic tags from this list only: announcements, preview, results, post-fight, rumors.",
      "announcements = confirmed bookings, new fights added to a card, event date/venue reveals.",
      "preview = fight previews, matchup breakdowns, keys to victory, betting angles before the event.",
      "results = fight outcomes, finishes, scorecards, post-event recaps.",
      "post-fight = post-fight reactions, winner interviews, what-next stories after a fight happened.",
      "rumors = unconfirmed reports, targeting, in talks, expected to face.",
      "Return tagSlugs as an array of strings from the list above. Multiple tags are allowed.",
      "Choose one promotion slug only from the allowed shortlist when the league is clear. Otherwise return an empty string.",
      "Return fighter slugs only from the allowed fighter shortlist. Include up to 6 relevant fighters actually mentioned in the article.",
      "Do not invent fighters or promotions.",
      "Return strict JSON with keys isUfc, contentType, tagSlugs, promotionSlug, fighterSlugs, confidence, reason.",
      "",
      `Heuristic promotion guess: ${promotionContext.inferred || "unknown"}`,
      "",
      "Allowed promotions shortlist:",
      promotionsBlock || "- none",
      "",
      "Allowed fighters shortlist:",
      fightersBlock || "- none",
      "",
      `Title: ${input.headline}`,
      `Source label: ${input.sourceLabel}`,
      `Source URL: ${input.sourceUrl}`,
      "Body:",
      String(input.body || "").slice(0, MAX_BODY_LENGTH)
    ].join("\n"),
    inferredPromotionSlug: promotionContext.inferred,
    heuristicFighterSlugs: fighterCandidates.slice(0, MAX_RETURNED_FIGHTERS).map((fighter) => fighter.slug),
    allowedPromotionSlugs: new Set(promotionContext.shortlist.map((item) => item.slug)),
    allowedFighterSlugs: new Set(fighterCandidates.map((fighter) => fighter.slug))
  };
}

function inferContentTypeHeuristically(input) {
  const text = normalizeForMatch(`${input.headline} ${input.body}`);

  if (/\b(interview|reacts|reaction|quote|quoted|press conference|media scrum|says|told)\b/i.test(text)) {
    return "interview";
  }
  if (/\b(preview|prediction|breakdown|analysis|matchup|keys to victory|fight pick)\b/i.test(text)) {
    return "analysis";
  }
  return "news";
}

async function classifyWithDeepSeek(prompt) {
  const response = await fetch(`${getDeepSeekBaseUrl().replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getDeepSeekApiKey()}`
    },
    body: JSON.stringify({
      model: getDeepSeekModel(),
      messages: [
        {
          role: "system",
          content:
            "You are an MMA content classifier for FightBase Media. Determine if a story is truly UFC-focused, classify it as news/interview/analysis/prediction, and assign topic tags (announcements, preview, results, post-fight, rumors). Return strict JSON only."
        },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1
    })
  });

  if (!response.ok) {
    throw new Error(`DeepSeek HTTP ${response.status}`);
  }

  const raw = await response.json();
  return parseJsonObject(raw?.choices?.[0]?.message?.content || "{}");
}

async function classifyWithOllama(prompt) {
  const response = await fetch(readEnv("OLLAMA_URL", DEFAULT_OLLAMA_URL), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: readEnv("OLLAMA_MODEL", DEFAULT_OLLAMA_MODEL),
      stream: false,
      format: "json",
      prompt,
      options: { temperature: 0.1 }
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama HTTP ${response.status}`);
  }

  const raw = await response.json();
  return parseJsonObject(raw?.response || "{}");
}

const ALLOWED_TAG_SLUGS = new Set(["announcements", "preview", "results", "post-fight", "rumors"]);

function inferTagSlugsHeuristic(category, headline, body) {
  const text = `${headline} ${body}`.toLowerCase();
  const tags = [];

  if (category === "analysis") {
    tags.push("preview", "analysis");
  }
  if (/\b(result|results|wins|defeats|stops|submits|knocks out|tko|ko|decision|scorecard)\b/i.test(text)) {
    tags.push("results");
  }
  if (/\b(announce|announced|booking|booked|set for|will headline|returns on|scheduled|added to)\b/i.test(text)) {
    tags.push("announcements");
  }
  if (/\b(rumor|rumour|targeting|in talks|expected to|could face)\b/i.test(text)) {
    tags.push("rumors");
  }
  if (/\b(preview|prediction|breakdown|matchup|keys to victory|fight pick|odds)\b/i.test(text)) {
    tags.push("preview");
  }
  if (/\b(post-fight|after the fight|reacts to|winner|aftermath|what.?s next|called out)\b/i.test(text)) {
    tags.push("post-fight");
  }

  return Array.from(new Set(tags));
}

async function classifyArticleWithAi(input) {
  const promptContext = buildPrompt(input);
  const heuristicContentType = inferContentTypeHeuristically(input);
  const heuristicTags = inferTagSlugsHeuristic(heuristicContentType, input.headline, input.body);
  const fallbackResult = {
    isUfc: /\b(?:ufc|mma)\b/i.test(`${input.headline} ${input.body} ${input.sourceLabel} ${input.sourceUrl}`),
    contentType: heuristicContentType,
    tagSlugs: heuristicTags,
    promotionSlug: promptContext.inferredPromotionSlug,
    fighterSlugs: promptContext.heuristicFighterSlugs.slice(0, MAX_RETURNED_FIGHTERS),
    confidence: 0.35,
    reason: "Heuristic fallback"
  };

  try {
    const parsed =
      getAiProvider() === "deepseek" && getDeepSeekApiKey()
        ? await classifyWithDeepSeek(promptContext.prompt)
        : await classifyWithOllama(promptContext.prompt);

    const promotionSlug = String(parsed.promotionSlug || "").trim();
    const fighterSlugs = uniqueStrings(Array.isArray(parsed.fighterSlugs) ? parsed.fighterSlugs : []).filter((slug) =>
      promptContext.allowedFighterSlugs.has(slug)
    );
    const rawType = String(parsed.contentType || "").trim().toLowerCase();
    const normalizedType =
      rawType === "prediction" ? "analysis" : ["news", "interview", "analysis"].includes(rawType) ? rawType : fallbackResult.contentType;

    const aiTags = uniqueStrings(Array.isArray(parsed.tagSlugs) ? parsed.tagSlugs : []).filter((slug) => ALLOWED_TAG_SLUGS.has(slug));

    return {
      isUfc: typeof parsed.isUfc === "boolean" ? parsed.isUfc : fallbackResult.isUfc,
      contentType: normalizedType,
      tagSlugs: aiTags.length > 0 ? aiTags : heuristicTags,
      promotionSlug: promptContext.allowedPromotionSlugs.has(promotionSlug) ? promotionSlug : promptContext.inferredPromotionSlug,
      fighterSlugs: (fighterSlugs.length > 0 ? fighterSlugs : promptContext.heuristicFighterSlugs).slice(0, MAX_RETURNED_FIGHTERS),
      confidence: Number(parsed.confidence) || fallbackResult.confidence,
      reason: String(parsed.reason || "").trim() || fallbackResult.reason
    };
  } catch {
    return fallbackResult;
  }
}

module.exports = {
  classifyArticleWithAi
};
