// Окно «турнирной ночи» — то же, что в event-night workflow
// (.github/workflows/event-night.yml): от 6 часов до даты события до 16 часов
// после. В нём workflow каждые 15 минут синкает результаты и ревалидирует
// страницы, а главная показывает live-баннер.

const BEFORE_MS = 6 * 60 * 60 * 1000;
const AFTER_MS = 16 * 60 * 60 * 1000;

export function isWithinEventNightWindow(eventDate: Date, now: Date) {
  const start = eventDate.getTime() - BEFORE_MS;
  const end = eventDate.getTime() + AFTER_MS;
  const timestamp = now.getTime();
  return timestamp >= start && timestamp <= end;
}

export function eventNightWindowBounds(now: Date) {
  // Событие попадает в окно, когда date ∈ [now − 16ч, now + 6ч].
  return {
    minDate: new Date(now.getTime() - AFTER_MS),
    maxDate: new Date(now.getTime() + BEFORE_MS)
  };
}
