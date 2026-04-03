import type { Locale } from "@/lib/locale-config";

const weightClassMap: Record<string, { ru: string; en: string }> = {
  strawweight: { ru: "Минимальный вес", en: "Strawweight" },
  flyweight: { ru: "Наилегчайший вес", en: "Flyweight" },
  bantamweight: { ru: "Легчайший вес", en: "Bantamweight" },
  featherweight: { ru: "Полулегкий вес", en: "Featherweight" },
  lightweight: { ru: "Легкий вес", en: "Lightweight" },
  welterweight: { ru: "Полусредний вес", en: "Welterweight" },
  middleweight: { ru: "Средний вес", en: "Middleweight" },
  light_heavyweight: { ru: "Полутяжелый вес", en: "Light heavyweight" },
  "light heavyweight": { ru: "Полутяжелый вес", en: "Light heavyweight" },
  heavyweight: { ru: "Тяжелый вес", en: "Heavyweight" },
  catchweight: { ru: "Договорной вес", en: "Catchweight" },
  openweight: { ru: "Открытый вес", en: "Openweight" }
};

const fighterStatusMap: Record<string, { ru: string; en: string }> = {
  active: { ru: "Активный", en: "Active" },
  champion: { ru: "Чемпион", en: "Champion" },
  retired: { ru: "Завершил карьеру", en: "Retired" },
  prospect: { ru: "Проспект", en: "Prospect" }
};

const fightStatusMap: Record<string, { ru: string; en: string }> = {
  scheduled: { ru: "Назначен", en: "Scheduled" },
  completed: { ru: "Завершен", en: "Completed" }
};

const fightStageMap: Record<string, { ru: string; en: string }> = {
  main_card: { ru: "Основной кард", en: "Main card" },
  prelims: { ru: "Прелимы", en: "Prelims" },
  early_prelims: { ru: "Ранние прелимы", en: "Early prelims" }
};

function localizeFromMap(
  map: Record<string, { ru: string; en: string }>,
  value: string,
  locale: Locale
) {
  const normalized = value.trim().toLowerCase();
  const entry = map[normalized];

  if (entry) {
    return entry[locale];
  }

  return value;
}

export function formatWeightClass(value: string, locale: Locale) {
  return localizeFromMap(weightClassMap, value, locale);
}

export function formatFighterStatus(value: string, locale: Locale) {
  return localizeFromMap(fighterStatusMap, value, locale);
}

export function formatFightStatus(value: string, locale: Locale) {
  return localizeFromMap(fightStatusMap, value, locale);
}

export function formatFightStage(value: string, locale: Locale) {
  return localizeFromMap(fightStageMap, value, locale);
}

export function getDisplayName(fighter: { name: string; nameRu?: string | null }, locale: Locale) {
  return locale === "ru" ? fighter.nameRu ?? fighter.name : fighter.name;
}
