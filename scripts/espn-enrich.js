// Общий модуль обогащения бойцов из ESPN. Используется двумя скриптами:
// sync-espn-roster.js (список со скорборда, свежие и ближайшие бои) и
// backfill-espn-fighter-data.js (список из нашей базы, догоняем остальных).
// Держим в одном месте, чтобы правило записи не разошлось между ними.

const { normalizeCountry } = require("./fighter-import-utils");
const { extractEspnAthleteProfile } = require("./espn-roster-utils");
const imageStore = require("./local-image-store");

const ATHLETE_URL = "https://site.web.api.espn.com/apis/common/v3/sports/mma/athletes";
const REQUEST_DELAY_MS = 200;

// Оба скрипта читают текущие значения всех обновляемых полей: это позволяет
// отличить заполнение пробелов от обновления рекорда и от холостого прогона.
const ESPN_FIGHTER_SELECT = {
  id: true, slug: true, name: true, espnId: true, photoUrl: true,
  record: true, age: true, heightCm: true, reachCm: true,
  winsByKnockout: true, winsBySubmission: true, team: true, style: true,
  weightClass: true, country: true, updatedAt: true
};
// country входит в выборку не только для сравнения: страну из ESPN пишем лишь в пустое поле.

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
  const raw = String(url || "").trim();
  // Те же критерии, что у isUsablePhoto в lib/display.ts; соответствие проверяют тесты.
  return Boolean(raw) && !/silhouette|logo_of_the_ultimate_fighting_championship|flag_of_|\/themes\/custom\/ufc\/assets\/img\//i.test(raw);
}

const BACKFILL_FIELD_CHECKS = {
  photoUrl: hasUsablePhoto,
  heightCm: (value) => Number(value) > 0,
  reachCm: (value) => Number(value) > 0,
  team: (value) => Boolean(String(value || "").trim()),
  age: (value) => Number(value) > 0
};

function missingEspnFields(fighter) {
  return Object.keys(BACKFILL_FIELD_CHECKS).filter((field) => !BACKFILL_FIELD_CHECKS[field](fighter[field]));
}

// Поля, которые ESPN действительно отдаёт. Ударной статистики UFC (SLpM,
// точность, тейкдауны) у ESPN нет, поэтому её отсутствие не повод для прогона:
// иначе одни и те же бойцы вечно считались бы недозаполненными.
function needsEspnBackfill(fighter) {
  return missingEspnFields(fighter).length > 0;
}

// Карточка, которую стоит догнать до турнира: без привязки к ESPN, без рекорда
// или с пробелами в полях, которые ESPN отдаёт. Бойцы-замены на коротком
// уведомлении создаются пустыми и попадают сюда (Павел Андруска, 09.2026).
function isProfileIncomplete(fighter) {
  return !fighter.espnId || !String(fighter.record || "").trim() || needsEspnBackfill(fighter);
}

// Что ESPN отдаёт заведомо мусорным: рекорд «0-0-0» у бойца с боями, стойка
// «--», а гражданство у ESPN бывает просто неверным (Брендан Аллен — «Brazil»),
// поэтому страну только заполняем, но никогда не перезаписываем.
function isUsableRecord(record) {
  return Boolean(record) && record !== "0-0-0";
}

function isUsableStyle(style) {
  const value = String(style || "").trim();
  return Boolean(value) && !/^-+$/.test(value);
}

async function enrichFighter(prisma, fighter, espnId, dryRun) {
  const payload = await fetchJson(`${ATHLETE_URL}/${espnId}`);
  const profile = extractEspnAthleteProfile(payload);

  const data = { espnId };

  if (isUsableRecord(profile.record)) data.record = profile.record;
  if (profile.age) data.age = profile.age;
  if (profile.heightCm) data.heightCm = profile.heightCm;
  if (profile.reachCm) data.reachCm = profile.reachCm;
  if (profile.koWins !== null) data.winsByKnockout = profile.koWins;
  if (profile.subWins !== null) data.winsBySubmission = profile.subWins;
  if (profile.team?.trim()) data.team = profile.team.trim();
  if (isUsableStyle(profile.style)) data.style = profile.style.trim();
  if (profile.weightClass) data.weightClass = profile.weightClass;
  if (profile.country && !String(fighter.country || "").trim()) data.country = normalizeCountry(profile.country);

  let photoError = null;
  if (!hasUsablePhoto(fighter.photoUrl) && hasUsablePhoto(profile.photoUrl)) {
    if (dryRun) {
      // В сухом прогоне показываем источник планируемого фото, ничего не скачивая.
      data.photoUrl = profile.photoUrl;
    } else {
      try {
        const localized = await imageStore.persistImageLocally({
          bucket: "fighters",
          key: fighter.slug,
          sourceUrl: profile.photoUrl
        });
        if (!hasUsablePhoto(localized)) throw new Error("Photo was not saved");
        data.photoUrl = localized;
      } catch (error) {
        photoError = error.message || String(error);
      }
    }
  }

  const changes = Object.fromEntries(Object.entries(data).filter(([field, value]) => fighter[field] !== value));
  const changedFields = Object.keys(changes);
  const filledFields = missingEspnFields(fighter).filter(
    (field) => Object.hasOwn(changes, field) && BACKFILL_FIELD_CHECKS[field](changes[field])
  );

  if (dryRun) {
    console.log(`[dry] ${fighter.slug}: ${JSON.stringify({ changes, filledFields })}`);
  } else {
    // Сохраняем прежнее обновление updatedAt даже без новых данных: оба скрипта
    // начинают со старых карточек, иначе холостые записи будут постоянно занимать лимит.
    await prisma.fighter.update({ where: { id: fighter.id }, data: { ...changes, espnId } });
  }

  return { changedFields, filledFields, photoError };
}

module.exports = {
  ATHLETE_URL,
  REQUEST_DELAY_MS,
  ESPN_FIGHTER_SELECT,
  enrichFighter,
  fetchJson,
  hasUsablePhoto,
  isProfileIncomplete,
  needsEspnBackfill,
  sleep
};
