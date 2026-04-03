import type { Locale } from "@/lib/locale-config";

const weightClassMap: Record<string, { ru: string; en: string }> = {
  strawweight: { ru: "Минимальный вес", en: "Strawweight" },
  flyweight: { ru: "Наилегчайший вес", en: "Flyweight" },
  bantamweight: { ru: "Легчайший вес", en: "Bantamweight" },
  featherweight: { ru: "Полулегкий вес", en: "Featherweight" },
  lightweight: { ru: "Легкий вес", en: "Lightweight" },
  welterweight: { ru: "Полусредний вес", en: "Welterweight" },
  middleweight: { ru: "Средний вес", en: "Middleweight" },
  "light heavyweight": { ru: "Полутяжелый вес", en: "Light heavyweight" },
  heavyweight: { ru: "Тяжелый вес", en: "Heavyweight" },
  catchweight: { ru: "Договорной вес", en: "Catchweight" },
  openweight: { ru: "Открытый вес", en: "Openweight" },
  "women's strawweight": { ru: "Женский минимальный вес", en: "Women's Strawweight" },
  "women's flyweight": { ru: "Женский наилегчайший вес", en: "Women's Flyweight" },
  "women's bantamweight": { ru: "Женский легчайший вес", en: "Women's Bantamweight" },
  "women's featherweight": { ru: "Женский полулегкий вес", en: "Women's Featherweight" }
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

const weightClassAliases: Record<string, string> = {
  strawweight: "Strawweight",
  "минимальный вес": "Strawweight",
  flyweight: "Flyweight",
  "наилегчайший вес": "Flyweight",
  bantamweight: "Bantamweight",
  "легчайший вес": "Bantamweight",
  featherweight: "Featherweight",
  "полулегкий вес": "Featherweight",
  lightweight: "Lightweight",
  "легкий вес": "Lightweight",
  welterweight: "Welterweight",
  "полусредний вес": "Welterweight",
  middleweight: "Middleweight",
  "средний вес": "Middleweight",
  "light heavyweight": "Light Heavyweight",
  light_heavyweight: "Light Heavyweight",
  "полутяжелый вес": "Light Heavyweight",
  heavyweight: "Heavyweight",
  "тяжелый вес": "Heavyweight",
  catchweight: "Catchweight",
  "договорной вес": "Catchweight",
  openweight: "Openweight",
  "открытый вес": "Openweight",
  "women's strawweight": "Women's Strawweight",
  "женский минимальный вес": "Women's Strawweight",
  "women's flyweight": "Women's Flyweight",
  "женский наилегчайший вес": "Women's Flyweight",
  "women's bantamweight": "Women's Bantamweight",
  "женский легчайший вес": "Women's Bantamweight",
  "women's featherweight": "Women's Featherweight",
  "женский полулегкий вес": "Women's Featherweight"
};

function decodeHtmlEntities(value: string) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/gi, "'")
    .replace(/&rsquo;/gi, "'")
    .replace(/&ldquo;|&rdquo;/gi, '"')
    .replace(/&ndash;|&mdash;/gi, "-");
}

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

export function normalizeWeightClassValue(value: string) {
  const decoded = decodeHtmlEntities(String(value || "")).replace(/\s+/g, " ").trim();
  const normalized = decoded.toLowerCase();
  return weightClassAliases[normalized] ?? decoded;
}

export function getWeightClassFilterValues(value: string) {
  const canonical = normalizeWeightClassValue(value);
  const localized = localizeFromMap(weightClassMap, canonical, "ru");

  return [...new Set([value, canonical, localized].map((item) => decodeHtmlEntities(String(item || "")).trim()).filter(Boolean))];
}

export function formatWeightClass(value: string, locale: Locale) {
  return localizeFromMap(weightClassMap, normalizeWeightClassValue(value), locale);
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

export function isUsablePhoto(url?: string | null) {
  const raw = String(url || "").trim();
  if (!raw) {
    return false;
  }

  return !/silhouette|logo_of_the_ultimate_fighting_championship|flag_of_|\/themes\/custom\/ufc\/assets\/img\//i.test(raw);
}
