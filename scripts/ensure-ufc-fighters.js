const { fetchText, slugify } = require("./fighter-import-utils");
const { syncUfcFighterBySlug } = require("./sync-ufc-roster");

function normalizeForMatch(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Zа-яА-Я0-9]+/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueStrings(values) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function extractNameCandidates(text) {
  const source = String(text || "");
  const patterns = [
    /\b[A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)?(?:\s+[A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)?){1,2}\b/g,
    /\b[А-ЯЁ][а-яё]+(?:[-'][А-ЯЁ]?[а-яё]+)?(?:\s+[А-ЯЁ][а-яё]+(?:[-'][А-ЯЁ]?[а-яё]+)?){1,2}\b/g
  ];

  return uniqueStrings(patterns.flatMap((pattern) => Array.from(source.matchAll(pattern)).map((match) => match[0]))).filter(
    (name) => name.split(/\s+/).length >= 2
  );
}

function extractAthleteSlugs(html) {
  return uniqueStrings(Array.from(html.matchAll(/href="\/athlete\/([^"?#/]+)"/gi)).map((match) => match[1]));
}

function titleLooksLikeFighter(html, candidateName) {
  const title = (html.match(/<title>([^<]+)<\/title>/i)?.[1] || "").replace(/\s+\|\s+UFC$/i, "").trim();
  if (!title) {
    return false;
  }

  return normalizeForMatch(title) === normalizeForMatch(candidateName);
}

async function athletePageExistsForName(slug, candidateName) {
  try {
    const html = await fetchText(`https://www.ufc.com/athlete/${slug}`);
    return titleLooksLikeFighter(html, candidateName);
  } catch {
    return false;
  }
}

async function resolveUfcSlugForName(candidateName) {
  const directSlug = slugify(candidateName);
  if (directSlug && (await athletePageExistsForName(directSlug, candidateName))) {
    return directSlug;
  }

  try {
    const searchHtml = await fetchText(`https://www.ufc.com/search?search=${encodeURIComponent(candidateName)}`);
    const candidateSlugs = extractAthleteSlugs(searchHtml);

    for (const slug of candidateSlugs) {
      if (await athletePageExistsForName(slug, candidateName)) {
        return slug;
      }
    }
  } catch {}

  return "";
}

async function ensureUfcFightersForText(prisma, text, limit = 2) {
  const candidates = extractNameCandidates(text);
  const imported = [];

  for (const candidateName of candidates) {
    if (imported.length >= limit) {
      break;
    }

    const normalizedCandidate = normalizeForMatch(candidateName);
    const existing = await prisma.fighter.findFirst({
      where: {
        promotion: { slug: "ufc" },
        OR: [{ name: candidateName }, { nameRu: candidateName }]
      },
      select: { slug: true }
    });

    if (existing) {
      continue;
    }

    const slug = await resolveUfcSlugForName(candidateName);
    if (!slug) {
      continue;
    }

    const synced = await syncUfcFighterBySlug(prisma, slug);
    imported.push({
      candidateName,
      fighter: synced.fighter
    });
  }

  return imported;
}

module.exports = {
  ensureUfcFightersForText,
  extractNameCandidates,
  resolveUfcSlugForName
};
