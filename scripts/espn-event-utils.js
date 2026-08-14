// Вспомогательные функции синка событий из ESPN scoreboard.

function normalizeEventLabel(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Сегменты карда из времён боёв: ESPN не размечает cardSegment в scoreboard,
// но бои каждого сегмента стартуют одним временем, поэтому кластеры однозначны.
// 1 кластер — только главный кард, 2 — прелимы + главный, 3+ — ранние прелимы
// первым кластером, главный кард последним.
function deriveCardTimes(competitionDates) {
  const unique = [
    ...new Set(
      (competitionDates || [])
        .map((value) => {
          const time = new Date(value || 0).getTime();
          return Number.isFinite(time) && time > 0 ? time : null;
        })
        .filter((time) => time !== null)
    )
  ].sort((left, right) => left - right);

  const toDate = (time) => new Date(time);

  if (unique.length === 0) {
    return { earlyPrelimsAt: null, prelimsAt: null, mainCardAt: null };
  }
  if (unique.length === 1) {
    return { earlyPrelimsAt: null, prelimsAt: null, mainCardAt: toDate(unique[0]) };
  }
  if (unique.length === 2) {
    return { earlyPrelimsAt: null, prelimsAt: toDate(unique[0]), mainCardAt: toDate(unique[1]) };
  }
  return {
    earlyPrelimsAt: toDate(unique[0]),
    prelimsAt: toDate(unique[unique.length - 2]),
    mainCardAt: toDate(unique[unique.length - 1])
  };
}

// Матч события из ответа ESPN: сначала по нормализованному названию, затем по
// близости даты (±36 часов). Нужен потому, что запрос ?dates=YYYYMMDD может не
// вернуть событие, датированное у ESPN соседним днём относительно календаря.
const MATCH_WINDOW_MS = 36 * 60 * 60 * 1000;

function matchEspnEvent(events, entry) {
  const list = Array.isArray(events) ? events : [];
  const wantedLabel = normalizeEventLabel(entry?.label);
  const wantedTime = new Date(entry?.date || 0).getTime();

  if (wantedLabel) {
    const byLabel = list.find((event) => normalizeEventLabel(event?.name) === wantedLabel);
    if (byLabel) {
      return byLabel;
    }
  }

  if (!Number.isFinite(wantedTime) || wantedTime <= 0) {
    return null;
  }

  let best = null;
  let bestDistance = Infinity;

  for (const event of list) {
    const eventTime = new Date(event?.date || 0).getTime();
    if (!Number.isFinite(eventTime) || eventTime <= 0) {
      continue;
    }
    const distance = Math.abs(eventTime - wantedTime);
    if (distance <= MATCH_WINDOW_MS && distance < bestDistance) {
      best = event;
      bestDistance = distance;
    }
  }

  return best;
}

// «Дата турнира» в базе — полночь UTC дня главного карда: календарь ESPN для
// близких событий отдаёт реальное время старта (вечер предыдущего дня по UTC),
// и без нормализации дата события уезжала бы на день назад.
function normalizeEventDate(calendarDate, mainCardAt) {
  const anchor = mainCardAt || calendarDate;
  return new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate()));
}

module.exports = {
  normalizeEventLabel,
  deriveCardTimes,
  matchEspnEvent,
  normalizeEventDate
};
