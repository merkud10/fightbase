import type { Locale } from "@/lib/locale-config";

export async function getLocale(): Promise<Locale> {
  return "ru";
}

export const dictionary = {
  ru: {
    languageName: "RU",
    otherLanguageName: "EN",
    brandTagline: "UFC-медиа",
    nav: {
      news: "Новости",
      events: "Турниры",
      fighters: "Бойцы",
      rankings: "Рейтинги",
      predictions: "Прогнозы",
      quotes: "Интервью",
      videos: "Видео",
      about: "О сайте"
    },
    common: {
      search: "Поиск",
      subscribe: "Подписка",
      all: "Все",
      sources: "Источники",
      profile: "Профиль",
      eventCard: "Турнир",
      readArticle: "Читать материал",
      viewEvents: "Все турниры",
      openCoverage: "Открыть материал",
      openPrediction: "Превью боя"
    }
  },
  en: {
    languageName: "EN",
    otherLanguageName: "RU",
    brandTagline: "UFC media",
    nav: {
      news: "News",
      events: "Events",
      fighters: "Fighters",
      rankings: "Rankings",
      predictions: "Predictions",
      quotes: "Interviews",
      videos: "Videos",
      about: "About"
    },
    common: {
      search: "Search",
      subscribe: "Subscription",
      all: "All",
      sources: "Sources",
      profile: "Profile",
      eventCard: "Event",
      readArticle: "Read feature",
      viewEvents: "All events",
      openCoverage: "Read story",
      openPrediction: "Fight preview"
    }
  }
} as const;

export function getDictionary(locale: Locale) {
  return dictionary[locale];
}
