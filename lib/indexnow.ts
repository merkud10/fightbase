// IndexNow: сообщаем Яндексу (и через него Bing и другим участникам протокола) о новых
// и изменённых страницах сразу, а не ждём обхода по sitemap. Прогнозы живут 1–3 дня
// до боя, и без пинга Яндекс находит их, когда спрос уже прошёл.
// Ключ публичный по протоколу: он же лежит в public/<ключ>.txt.
export const INDEXNOW_KEY = "ce8cb19412c9f8c4100bb4d760b32820";
export const INDEXNOW_ENDPOINT = "https://yandex.com/indexnow";

const MAX_URLS_PER_REQUEST = 10_000;

export type IndexNowPayload = {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
};

// Только адреса своего хоста (иначе Яндекс отклоняет весь запрос с 422), без
// повторов, пачками по лимиту протокола.
export function buildIndexNowPayloads(siteUrl: string, urls: string[]): IndexNowPayload[] {
  const origin = new URL(siteUrl);
  const urlList = [
    ...new Set(
      urls.filter((url) => {
        try {
          return new URL(url).host === origin.host;
        } catch {
          return false;
        }
      })
    )
  ];
  const payloads: IndexNowPayload[] = [];

  for (let index = 0; index < urlList.length; index += MAX_URLS_PER_REQUEST) {
    payloads.push({
      host: origin.host,
      key: INDEXNOW_KEY,
      keyLocation: `${origin.origin}/${INDEXNOW_KEY}.txt`,
      urlList: urlList.slice(index, index + MAX_URLS_PER_REQUEST)
    });
  }

  return payloads;
}

// Отправлять имеет смысл только с боевого домена: localhost Яндекс не примет.
export function isIndexNowEnabled(siteUrl: string) {
  const { hostname, protocol } = new URL(siteUrl);
  return protocol === "https:" && hostname !== "localhost" && !hostname.endsWith(".localhost");
}

// Точка отсчёта приходит от крона (время прошлой удачной отправки). Без неё или
// при битом значении берём два часа; совсем старые даты обрезаем неделей, чтобы
// после долгого простоя не слать весь сайт разом.
export function resolveIndexNowSince(value: unknown, now = new Date()) {
  const fallback = new Date(now.getTime() - 2 * 3_600_000);
  const oldest = new Date(now.getTime() - 7 * 86_400_000);
  const parsed = typeof value === "string" ? new Date(value) : null;

  if (!parsed || Number.isNaN(parsed.getTime()) || parsed > now) {
    return fallback;
  }

  return parsed < oldest ? oldest : parsed;
}
