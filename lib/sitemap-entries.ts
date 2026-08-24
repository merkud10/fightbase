import { isUsablePhoto } from "@/lib/display";

export function looksLikeLowQualitySlug(value: string) {
  return /-\d+$|i-am-still-here|wants-this|journey-continues|ufc-|vegas|edmonton|mexico-city/i.test(value);
}

// Бой с необъявленным соперником получает слаг вида opponent-tba-vs-tba-12.
// Страницы таких боёв неотличимы друг от друга («Opponent TBA — TBA»), поэтому
// ни в карту сайта, ни в индекс они не идут. Сравниваем по сегментам слага:
// «tba» встречается и внутри настоящих фамилий (Batbayar).
export function isPlaceholderFightSlug(value: string | null | undefined) {
  return String(value || "")
    .split("-")
    .some((part) => part === "tba" || part === "tbd");
}

// Профили ушедших бойцов и карточки без фото остаются в индексе: рекорд, история
// боёв и биография у них заполнены, а поисковый спрос по ветеранам не исчезает.
// Приоритет понижаем, чтобы краулинг-бюджет уходил в первую очередь на актуальный ростер.
export function getFighterPriority(status: string, photoUrl: string | null | undefined) {
  const base = status === "champion" ? 0.9 : status === "retired" ? 0.6 : 0.8;

  return isUsablePhoto(photoUrl) ? base : Math.round((base - 0.1) * 10) / 10;
}

// Лента целиком попадает в sitemap, поэтому архив не должен просить обход
// наравне со свежими материалами — иначе daily/0.9 стоит на статьях двухлетней давности.
export function getArticleFreshness(publishedAt: Date, now: number) {
  const ageDays = (now - publishedAt.getTime()) / 86_400_000;

  if (ageDays <= 14) {
    return { changeFrequency: "daily" as const, priority: 0.9 };
  }

  if (ageDays <= 180) {
    return { changeFrequency: "weekly" as const, priority: 0.7 };
  }

  return { changeFrequency: "monthly" as const, priority: 0.5 };
}
