import { buildEventSeoName } from "@/lib/event-seo";

type MainEvent = Parameters<typeof buildEventSeoName>[1];

// Подпись турнира под столбиком графика точности. У номерного турнира хватает
// номера, у остальных — пары главного боя: «UFC Fight Night:» одинаков у всех.
export function shortEventLabel(eventName: string) {
  const numbered = eventName.match(/^UFC\s+(\d+)\b/i);
  if (numbered) return `UFC ${numbered[1]}`;

  const afterColon = eventName.split(":").slice(1).join(":").trim();
  return (afterColon || eventName).replace(/\s+vs\.?\s+/i, " — ");
}

// Название турнира на вкладке страницы прогнозов: по-русски, если известен главный бой.
export function tabEventLabel(eventName: string, main: MainEvent | null, locale: string) {
  if (locale !== "ru" || !main) return shortEventLabel(eventName);

  const localized = buildEventSeoName(eventName, main);
  if (localized === eventName) return shortEventLabel(eventName);

  const numbered = localized.match(/^UFC (\d+) \(ЮФС \d+\)\s*(.*)$/);
  if (numbered) return numbered[2] ? `UFC ${numbered[1]}: ${numbered[2]}` : `UFC ${numbered[1]}`;

  return localized.split(":").slice(1).join(":").trim() || localized;
}

// Высота столбика в процентах шкалы 0–100. Ноль попаданий оставляем видимым
// штрихом, чтобы турнир не выглядел пропущенным.
export function barHeightPercent(bucket: { correct: number; judged: number }) {
  if (bucket.judged <= 0) return null;
  return Math.max(2, Math.round((bucket.correct / bucket.judged) * 100));
}
