// SEO-имя страницы турнира. По Search Console (сентябрь 2026) турниры ищут
// по-русски: «юфс 335» (2,5 тыс. показов, позиция 9), «юфс 335 кард», «когда
// юфс 335», «нурмагомедов сонг кард». Английское «UFC 335: X vs. Y» в заголовке
// этим запросам не отвечает — добавляем «ЮФС N» и русские фамилии главного боя.

import { isPlaceholderFightSlug } from "@/lib/sitemap-entries";

type MainEventSide = { slug: string; name: string };
export type MainEvent = { a: MainEventSide; b: MainEventSide } | null;

export function surname(name: string) {
  const words = name.trim().split(/\s+/);
  return words[words.length - 1] ?? "";
}

// Пока соперник не объявлен, в главном бою стоит «Opponent TBA — TBA»:
// в заголовок и описание такое не выводим.
export function isRealMainEvent(main: MainEvent): main is NonNullable<MainEvent> {
  if (!main) return false;
  return [main.a, main.b].every(
    (side) => !isPlaceholderFightSlug(side.slug) && !/^(opponent\s+)?(tba|tbd)$/i.test(side.name.trim())
  );
}

export function buildEventSeoName(eventName: string, main: MainEvent) {
  const pair = isRealMainEvent(main) ? `${surname(main.a.name)} — ${surname(main.b.name)}` : null;

  const numbered = eventName.match(/^UFC\s+(\d+)\b/i);
  if (numbered) {
    const base = `UFC ${numbered[1]} (ЮФС ${numbered[1]})`;
    return pair ? `${base} ${pair}` : base;
  }

  // «UFC Fight Night: Moicano vs. Nolan» → «UFC Fight Night: Мойкано — Нолан».
  const named = eventName.match(/^(.+?):\s*\S.*\bvs\.?\s+\S/i);
  if (named && pair) {
    return `${named[1]}: ${pair}`;
  }

  return eventName;
}
