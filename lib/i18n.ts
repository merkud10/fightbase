import { cookies, headers } from "next/headers";

import { localeCookieName, type Locale } from "@/lib/locale-config";

export async function getLocale(): Promise<Locale> {
  const headerStore = await headers();
  const headerLocale = headerStore.get("x-fightbase-locale");

  if (headerLocale === "ru" || headerLocale === "en") {
    return headerLocale;
  }

  const cookieStore = await cookies();
  const locale = cookieStore.get(localeCookieName)?.value;

  return locale === "en" ? "en" : "ru";
}

export const dictionary = {
  ru: {
    languageName: "RU",
    otherLanguageName: "EN",
    brandTagline: "ММА-медиа платформа",
    nav: {
      news: "Новости",
      events: "Турниры",
      fighters: "Бойцы",
      rankings: "Рейтинги",
      analysis: "Аналитика",
      quotes: "Цитаты",
      videos: "Видео",
      about: "О сайте"
    },
    common: {
      search: "Поиск",
      subscribe: "Подписаться",
      all: "Все",
      sources: "Источники",
      profile: "Профиль",
      eventCard: "Карточка турнира",
      readArticle: "Читать материал",
      viewEvents: "Смотреть турниры",
      openCoverage: "Открыть материал"
    }
  },
  en: {
    languageName: "EN",
    otherLanguageName: "RU",
    brandTagline: "MMA media platform",
    nav: {
      news: "News",
      events: "Events",
      fighters: "Fighters",
      rankings: "Rankings",
      analysis: "Analysis",
      quotes: "Quotes",
      videos: "Videos",
      about: "About"
    },
    common: {
      search: "Search",
      subscribe: "Subscribe",
      all: "All",
      sources: "Sources",
      profile: "Profile",
      eventCard: "Event card",
      readArticle: "Read feature",
      viewEvents: "View events",
      openCoverage: "Open coverage"
    }
  }
} as const;

export function getDictionary(locale: Locale) {
  return dictionary[locale];
}
