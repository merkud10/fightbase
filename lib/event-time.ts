import type { Locale } from "@/lib/locale-config";

// Времена сегментов карда храним в UTC; русской аудитории показываем Москву,
// английской — UTC, чтобы не привязываться к часовому поясу сервера.

export type EventCardTimes = {
  earlyPrelimsAt: Date | null;
  prelimsAt: Date | null;
  mainCardAt: Date | null;
};

export function formatCardTime(date: Date, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: locale === "ru" ? "Europe/Moscow" : "UTC"
  }).format(date);
}

// «В ночь на воскресенье, 17 августа» — дата главного карда в московской зоне.
export function formatCardNightLabel(mainCardAt: Date, locale: Locale) {
  if (locale !== "ru") {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC"
    }).format(mainCardAt);
  }

  const weekday = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    timeZone: "Europe/Moscow"
  }).format(mainCardAt);
  const dayMonth = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: "Europe/Moscow"
  }).format(mainCardAt);

  const nightWeekdays = new Map([
    ["понедельник", "в ночь на понедельник"],
    ["вторник", "в ночь на вторник"],
    ["среда", "в ночь на среду"],
    ["четверг", "в ночь на четверг"],
    ["пятница", "в ночь на пятницу"],
    ["суббота", "в ночь на субботу"],
    ["воскресенье", "в ночь на воскресенье"]
  ]);

  // Ночным считаем кард, стартующий по Москве до 12:00 — стандарт для США-ивентов.
  const hour = Number(
    new Intl.DateTimeFormat("ru-RU", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Moscow" }).format(
      mainCardAt
    )
  );

  if (hour < 12 && nightWeekdays.has(weekday)) {
    return `${nightWeekdays.get(weekday)}, ${dayMonth}`;
  }

  return `${weekday}, ${dayMonth}`;
}

export function hasCardTimes(times: Partial<EventCardTimes> | null | undefined) {
  return Boolean(times && (times.earlyPrelimsAt || times.prelimsAt || times.mainCardAt));
}
