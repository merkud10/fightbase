import type { Locale } from "@/lib/locale-config";
import { parseRankChange, type RankChange } from "@/lib/ufc-rankings";

export function describeRankChange(change: RankChange, locale: Locale) {
  if (change.direction === "new") {
    return locale === "ru" ? "новичок рейтинга" : "new to the rankings";
  }
  if (locale === "ru") {
    return `${change.direction === "up" ? "поднялся" : "опустился"} на ${change.delta}`;
  }
  return `${change.direction === "up" ? "up" : "down"} ${change.delta}`;
}

// Метка изменения позиции с последнего обновления рейтинга UFC: ▲1, ▼2, «нов.».
export function RankChangeBadge({ badge, locale }: { badge: string | null; locale: Locale }) {
  const change = parseRankChange(badge);
  if (!change) return null;

  const symbol =
    change.direction === "new" ? (locale === "ru" ? "нов." : "new") : `${change.direction === "up" ? "▲" : "▼"}${change.delta}`;
  const label = describeRankChange(change, locale);

  return (
    <span className={`rank-change rank-change--${change.direction}`} title={label}>
      <span aria-hidden="true">{symbol}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
