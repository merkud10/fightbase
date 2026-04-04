import type { Locale } from "@/lib/locale-config";

const weightClassMap: Record<string, { ru: string; en: string }> = {
  strawweight: { ru: "Минимальный вес", en: "Strawweight" },
  flyweight: { ru: "Наилегчайший вес", en: "Flyweight" },
  bantamweight: { ru: "Легчайший вес", en: "Bantamweight" },
  featherweight: { ru: "Полулегкий вес", en: "Featherweight" },
  lightweight: { ru: "Легкий вес", en: "Lightweight" },
  welterweight: { ru: "Полусредний вес", en: "Welterweight" },
  middleweight: { ru: "Средний вес", en: "Middleweight" },
  "light heavyweight": { ru: "Полутяжелый вес", en: "Light Heavyweight" },
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

const articleTagMap: Record<string, { ru: string; en: string }> = {
  announcements: { ru: "Анонсы", en: "Announcements" },
  announcement: { ru: "Анонсы", en: "Announcements" },
  preview: { ru: "Превью", en: "Preview" },
  results: { ru: "Результаты", en: "Results" },
  "post-fight": { ru: "После боя", en: "Post-fight" },
  postfight: { ru: "После боя", en: "Post-fight" },
  interview: { ru: "Интервью", en: "Interview" },
  analysis: { ru: "Аналитика", en: "Analysis" }
};

const locationTokenMap: Record<string, { ru: string; en: string }> = {
  "united states": { ru: "США", en: "United States" },
  canada: { ru: "Канада", en: "Canada" },
  australia: { ru: "Австралия", en: "Australia" },
  macao: { ru: "Макао", en: "Macao" },
  "las vegas": { ru: "Лас-Вегас", en: "Las Vegas" },
  miami: { ru: "Майами", en: "Miami" },
  winnipeg: { ru: "Виннипег", en: "Winnipeg" },
  perth: { ru: "Перт", en: "Perth" },
  newark: { ru: "Ньюарк", en: "Newark" }
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

function localizeFromMap(map: Record<string, { ru: string; en: string }>, value: string, locale: Locale) {
  const normalized = value.trim().toLowerCase();
  const entry = map[normalized];
  return entry ? entry[locale] : value;
}

function localizeLocationToken(value: string, locale: Locale) {
  const normalized = decodeHtmlEntities(String(value || "")).replace(/\s+/g, " ").trim().toLowerCase();
  return locationTokenMap[normalized]?.[locale] ?? value.trim();
}

function splitLocationString(value: string) {
  const normalized = decodeHtmlEntities(String(value || "")).replace(/\s+/g, " ").trim();
  if (!normalized) {
    return { city: "", country: "" };
  }

  const knownCountries = ["United States", "Canada", "Australia", "Macao"];
  const matchedCountry = knownCountries.find((country) => normalized.toLowerCase().endsWith(country.toLowerCase()));

  if (!matchedCountry) {
    return { city: normalized, country: "" };
  }

  const city = normalized.slice(0, normalized.length - matchedCountry.length).trim().replace(/[,\-]+$/, "").trim();
  return { city, country: matchedCountry };
}

export function formatEventLocation(city: string | null | undefined, venue: string | null | undefined, locale: Locale) {
  const normalizedCity = String(city || "").trim();
  const venueValue = String(venue || "").trim();
  const fallbackLocation =
    normalizedCity && normalizedCity !== "TBD"
      ? normalizedCity
      : venueValue.includes(",")
        ? venueValue.split(",").slice(1).join(",").trim()
        : "";

  const { city: parsedCity, country } = splitLocationString(fallbackLocation);
  const localizedCity = parsedCity ? localizeLocationToken(parsedCity, locale) : "";
  const localizedCountry = country ? localizeLocationToken(country, locale) : "";
  const venueName = venueValue ? (venueValue.split(",")[0] ?? venueValue).trim() : "";
  const locationLabel = [localizedCity, localizedCountry].filter(Boolean).join(", ");

  if (locationLabel && venueName) {
    return `${locationLabel} · ${venueName}`;
  }

  return locationLabel || venueName;
}

export function formatArticleTagLabel(value: string, locale: Locale) {
  const normalized = decodeHtmlEntities(String(value || "")).replace(/\s+/g, " ").trim().toLowerCase();
  return articleTagMap[normalized]?.[locale] ?? value;
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
