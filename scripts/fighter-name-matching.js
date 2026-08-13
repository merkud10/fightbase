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

module.exports = {
  findExactFighterMatch,
  normalizeFighterName,
  normalizeFighterSlug
};
