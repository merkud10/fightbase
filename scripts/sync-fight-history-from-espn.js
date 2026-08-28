#!/usr/bin/env node

// Восстанавливает историю боёв из архива турниров ESPN.
//
// Зачем: ufc.com отдаёт с сервера 403 (Cloudflare блокирует дата-центры), и
// прежний скрейп профилей больше не работает. У ESPN scoreboard есть архив по
// датам, и в нём исход помечен флагом winner отдельно для каждого участника —
// именно той структуры не хватало парсеру ufc.com, из-за чего бойцам
// приписывались чужие победы.
//
// Слияние, а не замена: ESPN достовернее по исходу, но метод боя отдаёт лишь
// в трети случаев, а в наших строках из Q&A-источника метод и заметки есть.
// Поэтому исход всегда берём у ESPN, а метод сохраняем свой, если он уже есть.
//
// По умолчанию dry-run, запись только с --apply.

const { PrismaClient } = require("@prisma/client");

const { transliterateName } = require("./fighter-import-utils");

const prisma = new PrismaClient();

const SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard";
const DAY_MS = 24 * 60 * 60 * 1000;

function parseArgValue(flag, fallback) {
  const index = process.argv.indexOf(flag);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    // NFD раскладывает только диакритику. Польская «ł», скандинавская «ø» и
    // прочие — самостоятельные буквы, и без этой замены «Syguła» и «Sygula»
    // остаются разными строками.
    .replace(/ł/gi, "l")
    .replace(/ø/gi, "o")
    .replace(/đ/gi, "d")
    .replace(/ß/g, "ss")
    .replace(/æ/gi, "ae")
    .replace(/œ/gi, "oe")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Дата и боец уже однозначно определяют бой: за сутки дважды не выступают.
// Поэтому для подтверждения хватает совпадения фамилии — это покрывает
// уменьшительные формы («Zach» против «Zachary») и опечатки в имени.
function looksLikeSamePerson(left, right) {
  // «Jr.», «III» и подобное стоит на месте фамилии и подменяет её при сравнении.
  const dropSuffixes = (words) => {
    const cleaned = words.filter((word) => !["jr", "sr", "ii", "iii", "iv"].includes(word));
    return cleaned.length > 0 ? cleaned : words;
  };

  const leftWords = dropSuffixes(normalizeName(left).split(" ").filter(Boolean));
  const rightWords = dropSuffixes(normalizeName(right).split(" ").filter(Boolean));

  if (leftWords.length === 0 || rightWords.length === 0) {
    return false;
  }

  if (leftWords.every((word) => rightWords.includes(word)) || rightWords.every((word) => leftWords.includes(word))) {
    return true;
  }

  const leftSurname = leftWords[leftWords.length - 1];
  const rightSurname = rightWords[rightWords.length - 1];

  if (leftSurname.length > 2 && leftSurname === rightSurname) {
    return true;
  }

  // Фамилии часто расходятся на букву-две: «Vazquez»/«Vasquez»,
  // «Sadykhov»/«Sadkyhov». Чем короче фамилия, тем легче случайно склеить
  // разных людей, поэтому для четырёхбуквенных допускаем лишь одну замену.
  const shortest = Math.min(leftSurname.length, rightSurname.length);
  if (shortest >= 5) {
    return editDistance(leftSurname, rightSurname) <= 2;
  }
  if (shortest === 4) {
    return editDistance(leftSurname, rightSurname) <= 1;
  }

  return false;
}

function editDistance(left, right) {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }

  return previous[right.length];
}

function formatDateStamp(date) {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
}

// Помесячные окна: одним запросом на год ESPN отдаёт неполную выборку.
function buildMonthWindows(months) {
  const windows = [];
  const cursor = new Date();
  cursor.setUTCDate(1);

  for (let index = 0; index < months; index += 1) {
    const start = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - index, 1));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
    windows.push(`${formatDateStamp(start)}-${formatDateStamp(end)}`);
  }

  return windows;
}

// «Unofficial Winner Kotko» — так ESPN пишет KO/TKO.
function parseMethod(competition) {
  for (const detail of competition.details || []) {
    const text = detail.type?.text || "";
    if (/decision/i.test(text)) return "Решение судей";
    if (/submission/i.test(text)) return "Сабмишен";
    if (/kotko|\bko\b|tko/i.test(text)) return "KO/TKO";
  }

  return null;
}

async function collectEspnFights(months) {
  const fights = [];

  for (const window of buildMonthWindows(months)) {
    const response = await fetch(`${SCOREBOARD_URL}?dates=${window}`);
    if (!response.ok) {
      continue;
    }

    const payload = await response.json();

    for (const event of payload.events || []) {
      for (const competition of event.competitions || []) {
        if (competition.status?.type?.completed !== true) {
          continue;
        }

        const competitors = competition.competitors || [];
        if (competitors.length !== 2) {
          continue;
        }

        // Ничьи и несостоявшиеся бои флага winner не имеют — исход по ним
        // не определить, поэтому пропускаем, а не угадываем.
        if (!competitors.some((competitor) => competitor.winner === true)) {
          continue;
        }

        fights.push({
          eventName: event.name || "UFC",
          date: new Date(competition.date || event.date),
          round: competition.status?.period || null,
          time: competition.status?.displayClock || null,
          weightClass: competition.type?.abbreviation || null,
          method: parseMethod(competition),
          competitors: competitors.map((competitor) => ({
            espnId: competitor.id ? String(competitor.id) : null,
            name: competitor.athlete?.displayName || "",
            won: competitor.winner === true
          }))
        });
      }
    }
  }

  return fights;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const months = Number(parseArgValue("--months", "12"));

  const fighters = await prisma.fighter.findMany({
    select: { id: true, slug: true, name: true, espnId: true, recentFights: { select: { id: true, opponentName: true, date: true, result: true, method: true, round: true, time: true } } }
  });

  const byEspnId = new Map(fighters.filter((fighter) => fighter.espnId).map((fighter) => [String(fighter.espnId), fighter]));
  const byName = new Map();
  for (const fighter of fighters) {
    const key = normalizeName(fighter.name);
    byName.set(key, byName.has(key) ? null : fighter); // null = имя неоднозначно
  }

  const espnFights = await collectEspnFights(months);

  const creates = [];
  const resultFixes = [];
  const espnIdBackfill = new Map();
  const nameCollisions = [];
  const collisionRepairs = [];
  // ESPN отдаёт один и тот же бой не единожды, иногда с датой, разъезжающейся
  // на сутки. Карта существующих строк снимается один раз до цикла и о своих же
  // вставках не знает, поэтому ведём отдельный учёт уже поставленного в очередь.
  const queued = new Set();
  let unmatched = 0;

  for (const fight of espnFights) {
    for (const [index, competitor] of fight.competitors.entries()) {
      const opponent = fight.competitors[index === 0 ? 1 : 0];

      let fighter = competitor.espnId ? byEspnId.get(competitor.espnId) : null;
      if (!fighter) {
        const candidate = byName.get(normalizeName(competitor.name));
        if (candidate) {
          fighter = candidate;
          if (competitor.espnId && !candidate.espnId && !byEspnId.has(competitor.espnId)) {
            espnIdBackfill.set(candidate.id, competitor.espnId);
          }
        }
      }

      if (!fighter) {
        unmatched += 1;
        continue;
      }

      const result = competitor.won ? "Победа" : "Поражение";
      const existing = fighter.recentFights.find(
        (row) =>
          normalizeName(row.opponentName) === normalizeName(opponent.name) &&
          Math.abs(row.date.getTime() - fight.date.getTime()) <= DAY_MS
      );

      if (existing) {
        if (existing.result !== result) {
          resultFixes.push({ id: existing.id, slug: fighter.slug, from: existing.result, to: result, opponent: opponent.name });
        }
        continue;
      }

      // Имя соперника у нас может быть записано иначе, чем в ESPN. Тогда точного
      // совпадения не будет, и строка уедет в creates — то есть станет дублем.
      // Такие случаи считаем отдельно: это мера риска, а не просто статистика.
      const sameDay = fighter.recentFights.find((row) => Math.abs(row.date.getTime() - fight.date.getTime()) <= DAY_MS);
      if (sameDay) {
        // Часто это тот же соперник, записанный короче: у нас «Pulyaev», у ESPN
        // «Andrey Pulyaev». Если все наши слова входят в имя ESPN (или наоборот),
        // это один человек, и строку можно чинить, а не пропускать.
        const subset = looksLikeSamePerson(sameDay.opponentName, opponent.name);

        nameCollisions.push({
          slug: fighter.slug,
          espnOpponent: opponent.name,
          ourOpponent: sameDay.opponentName,
          date: fight.date.toISOString().slice(0, 10),
          sameFighter: subset,
          rowId: sameDay.id,
          currentResult: sameDay.result,
          espnResult: result
        });

        // Имя берём у ESPN как каноническое: оно и полнее («Pulyaev» ->
        // «Andrey Pulyaev»), и чистит мусор вроде «stopped Luke Fernandez»,
        // где в поле имени осел глагол из протокола.
        if (subset && (sameDay.result !== result || sameDay.opponentName !== opponent.name)) {
          collisionRepairs.push({
            id: sameDay.id,
            result,
            opponentName: opponent.name,
            opponentNameRu: transliterateName(opponent.name)
          });
        }

        continue;
      }

      // Ключ огрубляем до суток и берём обе соседние даты: если тот же бой
      // приедет со сдвигом на день, он попадёт в уже занятый ключ.
      const dayIndex = Math.floor(fight.date.getTime() / DAY_MS);
      const opponentKey = normalizeName(opponent.name);
      const keys = [dayIndex - 1, dayIndex, dayIndex + 1].map((day) => `${fighter.id}|${opponentKey}|${day}`);
      if (keys.some((key) => queued.has(key))) {
        continue;
      }
      queued.add(`${fighter.id}|${opponentKey}|${dayIndex}`);

      creates.push({
        fighterId: fighter.id,
        slug: fighter.slug,
        opponentName: opponent.name,
        opponentNameRu: transliterateName(opponent.name),
        eventName: fight.eventName,
        result,
        method: fight.method,
        date: fight.date,
        round: fight.round,
        time: fight.time,
        weightClass: fight.weightClass,
        notes: null
      });
    }
  }

  const summary = {
    mode: apply ? "apply" : "dry-run",
    monthsScanned: months,
    espnFights: espnFights.length,
    unmatchedParticipants: unmatched,
    newRows: creates.length,
    skippedNameCollisions: nameCollisions.length,
    collisionsSameFighter: nameCollisions.filter((item) => item.sameFighter).length,
    collisionsRepaired: collisionRepairs.length,
    resultsCorrected: resultFixes.length,
    // Раскрыть скрытое «уточняется» — безобидно. Перевернуть уже определённый
    // исход — заявка на то, что наши данные неверны, и её надо смотреть глазами.
    resultsRevealed: resultFixes.filter((fix) => fix.from === "Результат уточняется").length,
    // «Победа»→«Поражение» — подпись прежнего бага, где всем ставилась победа.
    // Обратное направление подозрительнее: скорее ошибка сопоставления бойцов.
    flippedWinToLoss: resultFixes.filter((fix) => fix.from === "Победа" && fix.to === "Поражение").length,
    flippedLossToWin: resultFixes.filter((fix) => fix.from === "Поражение" && fix.to === "Победа").length,
    espnIdBackfill: espnIdBackfill.size
  };

  if (!apply) {
    console.log(
      JSON.stringify(
        {
          ...summary,
          sampleFlips: resultFixes.filter((fix) => fix.from !== "Результат уточняется").slice(0, 10),
          sampleCollisions: nameCollisions.filter((item) => !item.sameFighter).slice(0, 20),
          sampleNew: creates.slice(0, 3)
        },
        null,
        1
      )
    );
    return;
  }

  for (const fix of resultFixes) {
    await prisma.fighterRecentFight.update({ where: { id: fix.id }, data: { result: fix.to } });
  }

  for (const repair of collisionRepairs) {
    const { id, ...data } = repair;
    await prisma.fighterRecentFight.update({ where: { id }, data });
  }

  for (const row of creates) {
    const { slug, ...data } = row;
    await prisma.fighterRecentFight.create({ data });
  }

  for (const [fighterId, espnId] of espnIdBackfill) {
    await prisma.fighter.update({ where: { id: fighterId }, data: { espnId } }).catch(() => {});
  }

  console.log(JSON.stringify(summary, null, 1));
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error.message || error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

module.exports = { normalizeName, looksLikeSamePerson, buildMonthWindows, parseMethod };
