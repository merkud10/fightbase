// Общий модуль обогащения бойцов из ESPN. Используется двумя скриптами:
// sync-espn-roster.js (список со скорборда, свежие и ближайшие бои) и
// backfill-espn-fighter-data.js (список из нашей базы, догоняем остальных).
// Держим в одном месте, чтобы правило записи не разошлось между ними.

const { normalizeCountry } = require("./fighter-import-utils");
const { extractEspnAthleteProfile } = require("./espn-roster-utils");
const { persistImageLocally } = require("./local-image-store");

const ATHLETE_URL = "https://site.web.api.espn.com/apis/common/v3/sports/mma/athletes";
const REQUEST_DELAY_MS = 200;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Встроенный fetch (undici): node https.get ловит 403 от ESPN по
// TLS-фингерпринту, а undici проходит и локально, и с сервера.
async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      Accept: "application/json"
    },
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    throw new Error(`ESPN API HTTP ${response.status} for ${url}`);
  }

  return response.json();
}

function hasUsablePhoto(url) {
  return Boolean(String(url || "").trim());
}

// Поля, которые ESPN действительно отдаёт. Ударной статистики UFC (SLpM,
// точность, тейкдауны) у ESPN нет, поэтому её отсутствие не повод для прогона:
// иначе одни и те же бойцы вечно считались бы недозаполненными.
function needsEspnBackfill(fighter) {
  return (
    !hasUsablePhoto(fighter.photoUrl) ||
    !fighter.heightCm ||
    !fighter.reachCm ||
    !String(fighter.team || "").trim() ||
    !fighter.age
  );
}

async function enrichFighter(prisma, fighter, espnId, dryRun) {
  const payload = await fetchJson(`${ATHLETE_URL}/${espnId}`);
  const profile = extractEspnAthleteProfile(payload);

  const data = { espnId };

  if (profile.record) data.record = profile.record;
  if (profile.age) data.age = profile.age;
  if (profile.heightCm) data.heightCm = profile.heightCm;
  if (profile.reachCm) data.reachCm = profile.reachCm;
  if (profile.koWins !== null) data.winsByKnockout = profile.koWins;
  if (profile.subWins !== null) data.winsBySubmission = profile.subWins;
  if (profile.team) data.team = profile.team;
  if (profile.style) data.style = profile.style;
  if (profile.weightClass) data.weightClass = profile.weightClass;
  if (profile.country) data.country = normalizeCountry(profile.country);

  if (!hasUsablePhoto(fighter.photoUrl) && profile.photoUrl && !dryRun) {
    const localized = await persistImageLocally({
      bucket: "fighters",
      key: fighter.slug,
      sourceUrl: profile.photoUrl
    }).catch(() => null);
    if (localized) {
      data.photoUrl = localized;
    }
  }

  if (dryRun) {
    console.log(`[dry] ${fighter.slug}: ${JSON.stringify(data)}`);
    return;
  }

  await prisma.fighter.update({ where: { id: fighter.id }, data });
}

module.exports = {
  ATHLETE_URL,
  REQUEST_DELAY_MS,
  enrichFighter,
  fetchJson,
  hasUsablePhoto,
  needsEspnBackfill,
  sleep
};
