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

function hasSettledResult(fight) {
  if (fight?.status !== "completed") return false;
  if (fight.resultType === "draw" || fight.resultType === "no_contest") return true;
  return fight.resultType === "win" && Boolean(fight.winnerFighterId);
}

// Один и тот же бой заведён дважды — на основном профиле и на дубле. Остаётся
// копия основного профиля (на ней пик модели и адрес страницы), но результат мог
// прийти только на копию дубля: синк карда после появления дубля обновлял её.
// Так бой Кинг — Росас (Noche UFC, 12.09.2026) остался без победителя.
// Возвращает поля результата для боя основного профиля либо null.
function planDuplicateFightResult(keeperFight, loserFight, keeperId, loserId) {
  if (hasSettledResult(keeperFight) || !hasSettledResult(loserFight)) return null;

  return {
    status: "completed",
    resultType: loserFight.resultType,
    winnerFighterId: loserFight.winnerFighterId === loserId ? keeperId : loserFight.winnerFighterId ?? null,
    method: loserFight.method ?? null,
    resultRound: loserFight.resultRound ?? null,
    resultTime: loserFight.resultTime ?? null
  };
}

module.exports = { planFieldMerge, planDuplicateFightResult, totalBouts };
