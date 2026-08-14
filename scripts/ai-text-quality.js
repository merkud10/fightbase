// Общие проверки качества AI-текста для скриптов генерации (статьи, прогнозы).
// Вынесено из generate-ai-predictions.js; \b заменён на юникод-границы, потому что
// в JS \b не считает кириллицу словесными символами и такие паттерны не срабатывали.

function wordBounded(source) {
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`, "iu");
}

const RED_FLAG_RULES = [
  { label: "leftover_english_term", pattern: wordBounded("eligible|athletic commission") },
  {
    label: "raw_weight_class_english",
    pattern: wordBounded("featherweight|bantamweight|welterweight|middleweight|lightweight|heavyweight|flyweight")
  },
  { label: "bad_name_variant", pattern: wordBounded("Айсултан|Цсарукян") },
  { label: "bad_chris_variant", pattern: wordBounded("Чрис(?:а|у|ом|е)?") },
  { label: "bad_editorial_wording", pattern: wordBounded("маршист|веловес|фэзервейт") },
  { label: "multi_option_answer", pattern: /(?:^|\n)\s*(?:\*\*)?Вариант\s+\d/i }
];

function collectRedFlags(value) {
  return RED_FLAG_RULES.filter((rule) => rule.pattern.test(String(value || ""))).map((rule) => rule.label);
}

const CHRIS_CORRECTIONS = [
  ["Чриса", "Криса"],
  ["Чрису", "Крису"],
  ["Чрисом", "Крисом"],
  ["Чрисе", "Крисе"],
  ["Чрис", "Крис"]
];

function enforceNameCorrections(value) {
  let result = String(value || "");
  for (const [from, to] of CHRIS_CORRECTIONS) {
    result = result.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${from}(?![\\p{L}\\p{N}_])`, "gu"), to);
  }
  return result;
}

function latinShare(value) {
  const text = String(value || "");
  const cyrillic = (text.match(/[А-Яа-яЁё]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  const total = cyrillic + latin;
  return total === 0 ? 0 : latin / total;
}

module.exports = { RED_FLAG_RULES, collectRedFlags, enforceNameCorrections, latinShare };
