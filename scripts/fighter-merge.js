// Правила склейки профиля-дубля в основной профиль бойца (scripts/merge-fighters.js).
// Основной профиль сохраняет свои данные; пустые поля добирает из дубля.

const NULLABLE_FIELDS = [
  "espnId",
  "nameRu",
  "nickname",
  "photoUrl",
  "bioEn",
  "winsByKnockout",
  "winsBySubmission",
  "winsByDecision",
  "sigStrikesLandedPerMin",
  "strikeAccuracy",
  "sigStrikesAbsorbedPerMin",
  "strikeDefense",
  "takedownAveragePer15",
  "takedownAccuracy",
  "takedownDefense",
  "submissionAveragePer15",
  "averageFightTime"
];
const TEXT_FIELDS = ["country", "weightClass", "team", "style", "bio"];
const NUMBER_FIELDS = ["age", "heightCm", "reachCm"];

function isEmpty(value) {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

// «36-17-1» → 54. Записи без чисел считаем пустыми.
function totalBouts(record) {
  const parts = String(record || "").match(/\d+/g);
  return parts ? parts.slice(0, 3).reduce((sum, part) => sum + Number(part), 0) : 0;
}

// Какие поля основного профиля обновить данными дубля.
function planFieldMerge(keeper, loser) {
  const data = {};

  for (const field of NULLABLE_FIELDS) {
    if (isEmpty(keeper[field]) && !isEmpty(loser[field])) data[field] = loser[field];
  }
  for (const field of TEXT_FIELDS) {
    if (isEmpty(keeper[field]) && !isEmpty(loser[field])) data[field] = loser[field];
  }
  for (const field of NUMBER_FIELDS) {
    if (!keeper[field] && loser[field]) data[field] = loser[field];
  }
  // Рекорд свежее у того, у кого больше проведённых боёв.
  if (totalBouts(loser.record) > totalBouts(keeper.record)) data.record = loser.record;

  return data;
}

module.exports = { planFieldMerge, totalBouts };
