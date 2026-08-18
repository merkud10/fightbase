// Чистые функции ростер-синка через ESPN API: парсинг антропометрии и профиля
// атлета, сбор участников из скорборда. Источник выбран потому, что ufc.com
// закрыт Cloudflare для серверных IP, а ESPN стабильно отвечает и с сервера.

const CM_PER_INCH = 2.54;

// «5' 9"» → сантиметры (округлённо). Пустое/непарсибельное → 0.
function parseEspnHeightCm(displayHeight) {
  const match = String(displayHeight || "").match(/(\d+)\s*'\s*(\d+(?:\.\d+)?)?/);
  if (!match) {
    return 0;
  }
  const inches = Number(match[1]) * 12 + (Number(match[2]) || 0);
  return Math.round(inches * CM_PER_INCH);
}

// «74"» → сантиметры. Пустое/непарсибельное → 0.
function parseEspnReachCm(displayReach) {
  const match = String(displayReach || "").match(/(\d+(?:\.\d+)?)/);
  if (!match) {
    return 0;
  }
  return Math.round(Number(match[1]) * CM_PER_INCH);
}

function findStat(statsSummary, type) {
  const stats = statsSummary?.statistics;
  if (!Array.isArray(stats)) {
    return null;
  }
  const entry = stats.find((item) => item?.type === type);
  return entry?.displayValue || null;
}

// Профиль атлета из ответа /apis/common/v3/sports/mma/athletes/{id}.
// Поля со значением null вызывающая сторона не должна перезаписывать.
function extractEspnAthleteProfile(payload) {
  const athlete = payload?.athlete || payload || {};

  const record = findStat(athlete.statsSummary, "wins-losses-draws");
  const koRecord = findStat(athlete.statsSummary, "tkos-tkolosses");
  const subRecord = findStat(athlete.statsSummary, "submissions-submissionLosses");

  return {
    espnId: athlete.id ? String(athlete.id) : null,
    name: athlete.displayName || athlete.fullName || null,
    record: /^\d+-\d+(-\d+)?$/.test(String(record || "")) ? record : null,
    koWins: koRecord ? Number(String(koRecord).split("-")[0]) || 0 : null,
    subWins: subRecord ? Number(String(subRecord).split("-")[0]) || 0 : null,
    age: Number(athlete.age) || null,
    heightCm: parseEspnHeightCm(athlete.displayHeight) || null,
    reachCm: parseEspnReachCm(athlete.displayReach) || null,
    team: athlete.association?.name || null,
    style: athlete.displayFightingStyle || athlete.stance?.text || null,
    country: athlete.citizenship || null,
    weightClass: athlete.weightClass?.text || null,
    active: typeof athlete.active === "boolean" ? athlete.active : null,
    photoUrl: athlete.headshot?.href || null
  };
}

// Участники всех боёв из ответа скорборда: [{espnId, fullName}] без дублей.
// competitor.id в MMA-скорборде — это id атлета.
function collectScoreboardCompetitors(scoreboard) {
  const seen = new Map();

  for (const event of scoreboard?.events || []) {
    for (const competition of event.competitions || []) {
      for (const competitor of competition.competitors || []) {
        const espnId = competitor?.id ? String(competitor.id) : null;
        const fullName = competitor?.athlete?.fullName || competitor?.athlete?.displayName || null;
        if (espnId && fullName && !seen.has(espnId)) {
          seen.set(espnId, { espnId, fullName });
        }
      }
    }
  }

  return [...seen.values()];
}

module.exports = {
  parseEspnHeightCm,
  parseEspnReachCm,
  extractEspnAthleteProfile,
  collectScoreboardCompetitors
};
