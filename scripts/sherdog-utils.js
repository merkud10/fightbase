// Парсеры Sherdog и правила выбора кандидата для добора фото бойцов.
// Спека: docs/superpowers/specs/2026-09-06-sherdog-photo-fallback-design.md
// Без сети и БД, чтобы разметку и правила можно было проверять тестами.

const { normalizeFighterName } = require("./fighter-name-matching");

const SHERDOG_ORIGIN = "https://www.sherdog.com";
const SHERDOG_CDN_ORIGIN = "https://www1-cdn.sherdog.com";
// Рост у ESPN и Sherdog округляют по-разному (дюймы ↔ см).
const HEIGHT_TOLERANCE_CM = 3;
// Один бой разницы — разный учёт выставочных/отменённых боёв, больше — другой человек.
const WINS_TOLERANCE = 1;

function decodeEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .trim();
}

function parseSearchResults(html) {
  const rows = [];
  const rowPattern = /<tr onclick="document\.location='(\/fighter\/[^']+)';">([\s\S]*?)<\/tr>/g;
  let match;

  while ((match = rowPattern.exec(String(html || "")))) {
    const nameMatch = match[2].match(/<a href="\/fighter\/[^"]+">([^<]+)<\/a>/);
    if (!nameMatch) {
      continue;
    }
    const heightMatch = match[2].match(/\(([\d.]+)\s*m\)/);
    rows.push({
      name: decodeEntities(nameMatch[1]),
      path: match[1],
      heightCm: heightMatch ? Math.round(Number(heightMatch[1]) * 100) : null
    });
  }

  return rows;
}

function parseCounter(source, kind) {
  const match = source.match(new RegExp(`<div class="winloses ${kind}">\\s*<span>[^<]*</span>\\s*<span>(\\d+)</span>`));
  return match ? Number(match[1]) : null;
}

function parseFighterPage(html) {
  const source = String(html || "");
  const heightMatch = source.match(/itemprop="height">[^<]*<\/b>\s*<em>\/<\/em>\s*([\d.]+)\s*cm/);

  return {
    name: decodeEntities((source.match(/<span class="fn">([^<]+)<\/span>/) || [])[1] || ""),
    photoPath: (source.match(/<img[^>]+itemprop="image"[^>]+src="([^"]+)"/) || [])[1] || null,
    wins: parseCounter(source, "win"),
    losses: parseCounter(source, "lose"),
    heightCm: heightMatch ? Math.round(Number(heightMatch[1])) : null
  };
}

// Точное совпадение имени без учёта порядка слов: ESPN пишет «Kwon Won Il»,
// Sherdog — «Won Il Kwon». Частичное совпадение («Reginaldo Junior» и
// «Reginaldo Geraldo Jr.») намеренно не считается совпадением.
function nameKey(value) {
  return normalizeFighterName(value).split(" ").filter(Boolean).sort().join(" ");
}

function sameFighterName(a, b) {
  const keyA = nameKey(a);
  return Boolean(keyA) && keyA === nameKey(b);
}

function pickSearchCandidate(fighter, rows) {
  const byName = (rows || []).filter((row) => sameFighterName(row.name, fighter?.name));

  if (byName.length === 1) {
    return { row: byName[0] };
  }
  if (byName.length === 0) {
    return { reason: "unmatched" };
  }

  const ownHeight = Number(fighter?.heightCm) || 0;
  if (ownHeight > 0) {
    const byHeight = byName.filter(
      (row) => row.heightCm && Math.abs(row.heightCm - ownHeight) <= HEIGHT_TOLERANCE_CM
    );
    if (byHeight.length === 1) {
      return { row: byHeight[0] };
    }
  }

  return { reason: "ambiguous", candidates: byName.length };
}

function parseRecordWins(record) {
  const match = String(record || "").match(/^(\d+)-(\d+)/);
  return match ? Number(match[1]) : null;
}

function verifyFighterPage(fighter, page) {
  if (!sameFighterName(page?.name, fighter?.name)) {
    return "name mismatch";
  }
  if (!page?.photoPath || /default/i.test(page.photoPath)) {
    return "no photo";
  }

  const ownWins = parseRecordWins(fighter?.record);
  if (ownWins !== null && page.wins !== null && Math.abs(ownWins - page.wins) > WINS_TOLERANCE) {
    return `record mismatch (ours ${fighter.record}, sherdog ${page.wins}-${page.losses ?? "?"})`;
  }

  return null;
}

function buildPhotoSourceUrls(photoPath) {
  const path = String(photoPath || "");
  const file = (path.match(/\/_images\/fighter\/([^/?#]+)$/) || [])[1];
  const urls = [];

  if (file) {
    urls.push(`${SHERDOG_CDN_ORIGIN}/_images/fighter/${file}`);
  }
  if (path.startsWith("/")) {
    urls.push(`${SHERDOG_ORIGIN}${path}`);
  }

  return urls;
}

function buildSearchUrl(name) {
  return `${SHERDOG_ORIGIN}/stats/fightfinder?SearchTxt=${encodeURIComponent(String(name || "").trim())}`;
}

module.exports = {
  SHERDOG_ORIGIN,
  buildPhotoSourceUrls,
  buildSearchUrl,
  parseFighterPage,
  parseSearchResults,
  pickSearchCandidate,
  verifyFighterPage
};
