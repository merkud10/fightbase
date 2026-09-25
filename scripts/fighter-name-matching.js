function normalizeFighterName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/\p{Mark}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeFighterSlug(value) {
  return normalizeFighterName(value).replace(/\s+/g, "-");
}

function findExactFighterMatch(fighter, candidates) {
  const normalizedName = normalizeFighterName(fighter?.name);
  const normalizedSlug = normalizeFighterSlug(fighter?.slug || fighter?.name);
  const availableCandidates = Array.isArray(candidates) ? candidates.filter(Boolean) : [];

  if (normalizedSlug) {
    const slugMatches = availableCandidates.filter(
      (candidate) => normalizeFighterSlug(candidate.slug) === normalizedSlug
    );

    if (slugMatches.length === 1) return slugMatches[0];
    if (slugMatches.length > 1) return null;
  }

  if (normalizedName) {
    const nameMatches = availableCandidates.filter(
      (candidate) => normalizeFighterName(candidate.name) === normalizedName
    );

    if (nameMatches.length === 1) return nameMatches[0];
  }

  return null;
}

// Ключ имени без диакритики, суффиксов (Jr., III) и порядка слов: «Michael
// Aswell Jr.» = «Michael Aswell», «Liu Ce» = «Ce Liu», «Jan Błachowicz» =
// «Jan Blachowicz». Из-за буквального сравнения синки заводили такие имена
// вторыми профилями (12 дублей на проде, сентябрь 2026).
const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"]);

function fighterNameKey(value) {
  return normalizeFighterName(String(value || "").replace(/ł/gi, "l"))
    .split(" ")
    .filter((token) => token && !NAME_SUFFIXES.has(token))
    .sort()
    .join(" ");
}

// Боец из списка кандидатов с тем же ключом имени — только если он один.
function findFighterByNameKey(name, candidates) {
  const key = fighterNameKey(name);
  if (!key) return null;
  const matches = (Array.isArray(candidates) ? candidates : []).filter((candidate) => fighterNameKey(candidate.name) === key);
  return matches.length === 1 ? matches[0] : null;
}

module.exports = {
  fighterNameKey,
  findFighterByNameKey,
  findExactFighterMatch,
  normalizeFighterName,
  normalizeFighterSlug
};
