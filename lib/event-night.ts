// Окно «турнирной ночи»: в нём event-night workflow
// (.github/workflows/event-night.yml) каждые 15 минут синкает результаты и
// ревалидирует страницы, а главная показывает live-баннер. SQL в workflow
// должен совпадать с расчётом здесь.
//
// Если известны времена сегментов карда из ESPN, окно идёт от первого
// сегмента −3ч (запас на прелимы, когда ESPN отдаёт только главный кард) до
// главного карда +6ч. Без сегментов — от date −6ч до date +30ч: date хранится
// как полночь UTC, и европейский вечерний кард заканчивается почти через
// сутки после неё. Старое окно −6ч/+16ч закрылось для UFC Paris 05.09.2026
// (главный кард 19:00 UTC) ровно к началу прелимов, и результаты не подтянулись.

const SEGMENT_BEFORE_MS = 3 * 60 * 60 * 1000;
const SEGMENT_AFTER_MS = 6 * 60 * 60 * 1000;
const DATE_BEFORE_MS = 6 * 60 * 60 * 1000;
const DATE_AFTER_MS = 30 * 60 * 60 * 1000;

export type EventNightTimes = {
  date: Date;
  earlyPrelimsAt?: Date | null;
  prelimsAt?: Date | null;
  mainCardAt?: Date | null;
};

export function eventNightWindow(event: EventNightTimes) {
  const first = event.earlyPrelimsAt ?? event.prelimsAt ?? event.mainCardAt ?? null;
  const last = event.mainCardAt ?? event.prelimsAt ?? event.earlyPrelimsAt ?? null;

  if (first && last) {
    return {
      start: new Date(first.getTime() - SEGMENT_BEFORE_MS),
      end: new Date(last.getTime() + SEGMENT_AFTER_MS)
    };
  }

  return {
    start: new Date(event.date.getTime() - DATE_BEFORE_MS),
    end: new Date(event.date.getTime() + DATE_AFTER_MS)
  };
}

export function isWithinEventNightWindow(event: EventNightTimes, now: Date) {
  const { start, end } = eventNightWindow(event);
  const timestamp = now.getTime();
  return timestamp >= start.getTime() && timestamp <= end.getTime();
}

// Грубый диапазон по date для выборки кандидатов из БД; точную проверку
// делает isWithinEventNightWindow. Сегменты могут начинаться и за 7–8 часов
// до date (ранние прелимы американского карда), а окно европейского карда
// тянется до date +30ч.
const BOUNDS_BEFORE_MS = 30 * 60 * 60 * 1000;
const BOUNDS_AFTER_MS = 12 * 60 * 60 * 1000;

export function eventNightWindowBounds(now: Date) {
  return {
    minDate: new Date(now.getTime() - BOUNDS_BEFORE_MS),
    maxDate: new Date(now.getTime() + BOUNDS_AFTER_MS)
  };
}
