// После начала карда линию не обновляем: The Odds API по уже начавшемуся бою
// отдаёт коэффициенты по ходу поединка, и они затирали предматчевые. Так
// Гордон — Коста (UFC 334) за четыре минуты до прелимов получил 1.71 / 1.89
// вместо 3.93 / 1.25, а страница турнира записала победу фаворита в апсеты.
// Последняя линия до старта карда остаётся «линией закрытия».

function toTime(value) {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

// event — наш турнир с сегментами карда, oddsEvent — запись боя в The Odds API.
function isLineFrozen(event, oddsEvent, now = new Date()) {
  const nowTime = now.getTime();
  const segments = [event?.earlyPrelimsAt, event?.prelimsAt, event?.mainCardAt].map(toTime).filter((time) => time !== null);
  if (segments.length > 0 && Math.min(...segments) <= nowTime) return true;

  const commence = toTime(oddsEvent?.commence_time);
  return commence !== null && commence <= nowTime;
}

module.exports = { isLineFrozen };
