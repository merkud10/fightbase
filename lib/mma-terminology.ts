type ReplacementRule = [RegExp, string];

const WEIGHT_CLASS_CORRECTION_RULES: Array<{
  term: string;
  replacements: ReplacementRule[];
}> = [
  {
    term: "featherweight",
    replacements: [
      [/\bР»РµРіРєРёР№ РІРµСЃ\b/gi, "РїРѕР»СѓР»РµРіРєРёР№ РІРµСЃ"],
      [/\bР»РµРіРєРѕРіРѕ РІРµСЃР°\b/gi, "РїРѕР»СѓР»РµРіРєРѕРіРѕ РІРµСЃР°"],
      [/\bР»РµРіРєРѕРј РІРµСЃРµ\b/gi, "РїРѕР»СѓР»РµРіРєРѕРј РІРµСЃРµ"]
    ]
  },
  {
    term: "lightweight",
    replacements: [
      [/\bРїРѕР»СѓР»РµРіРєРёР№ РІРµСЃ\b/gi, "Р»РµРіРєРёР№ РІРµСЃ"],
      [/\bРїРѕР»СѓР»РµРіРєРѕРіРѕ РІРµСЃР°\b/gi, "Р»РµРіРєРѕРіРѕ РІРµСЃР°"],
      [/\bРїРѕР»СѓР»РµРіРєРѕРј РІРµСЃРµ\b/gi, "Р»РµРіРєРѕРј РІРµСЃРµ"]
    ]
  },
  {
    term: "welterweight",
    replacements: [
      [/\bСЃСЂРµРґРЅРёР№ РІРµСЃ\b/gi, "РїРѕР»СѓСЃСЂРµРґРЅРёР№ РІРµСЃ"],
      [/\bСЃСЂРµРґРЅРµРіРѕ РІРµСЃР°\b/gi, "РїРѕР»СѓСЃСЂРµРґРЅРµРіРѕ РІРµСЃР°"],
      [/\bСЃСЂРµРґРЅРµРј РІРµСЃРµ\b/gi, "РїРѕР»СѓСЃСЂРµРґРЅРµРј РІРµСЃРµ"]
    ]
  },
  {
    term: "light heavyweight",
    replacements: [
      [/\bС‚СЏР¶РµР»С‹Р№ РІРµСЃ\b/gi, "РїРѕР»СѓС‚СЏР¶РµР»С‹Р№ РІРµСЃ"],
      [/\bС‚СЏР¶РµР»РѕРіРѕ РІРµСЃР°\b/gi, "РїРѕР»СѓС‚СЏР¶РµР»РѕРіРѕ РІРµСЃР°"],
      [/\bС‚СЏР¶РµР»РѕРј РІРµСЃРµ\b/gi, "РїРѕР»СѓС‚СЏР¶РµР»РѕРј РІРµСЃРµ"]
    ]
  }
];

const MMA_GLOSSARY: Array<[string, string]> = [
  ["light heavyweight", "РїРѕР»СѓС‚СЏР¶РµР»С‹Р№ РІРµСЃ"],
  ["featherweight", "РїРѕР»СѓР»РµРіРєРёР№ РІРµСЃ"],
  ["lightweight", "Р»РµРіРєРёР№ РІРµСЃ"],
  ["welterweight", "РїРѕР»СѓСЃСЂРµРґРЅРёР№ РІРµСЃ"],
  ["middleweight", "СЃСЂРµРґРЅРёР№ РІРµСЃ"],
  ["heavyweight", "С‚СЏР¶РµР»С‹Р№ РІРµСЃ"],
  ["bantamweight", "Р»РµРіС‡Р°Р№С€РёР№ РІРµСЃ"],
  ["flyweight", "РЅР°РёР»РµРіС‡Р°Р№С€РёР№ РІРµСЃ"],
  ["main card", "РѕСЃРЅРѕРІРЅРѕР№ РєР°СЂРґ"],
  ["prelims", "РїСЂРµРґРІР°СЂРёС‚РµР»СЊРЅС‹Р№ РєР°СЂРґ"],
  ["showcase", "С€РѕСѓ РёР»Рё С‚СѓСЂРЅРёСЂ РїРѕ РєРѕРЅС‚РµРєСЃС‚Сѓ, РЅРµ РІС‹СЃС‚Р°РІРєР°"],
  ["rematch", "СЂРµРІР°РЅС€"]
];

export const MMA_EDITORIAL_RED_FLAG_RULES: Array<{ label: string; pattern: RegExp }> = [
  { label: "leftover_english_term", pattern: /\b(?:eligible|athletic commission)\b/i },
  {
    label: "raw_weight_class_english",
    pattern: /\b(?:featherweight|bantamweight|welterweight|middleweight|lightweight|heavyweight|flyweight)\b/i
  },
  {
    label: "bad_editorial_wording",
    pattern: /\b(?:\u043c\u0430\u0440\u0448\u0438\u0441\u0442|\u0432\u0435\u043b\u043e\u0432\u0435\u0441|\u0444\u044d\u0437\u0435\u0440\u0432\u0435\u0439\u0442|\u0431\u0430\u043c\u0431\u0430\u0442\u0430-\u0432\u0435\u0439\u0442|\u0431\u043e\u0439\u0446\u043e\u0432\u0430\u044f \u0447\u0435\u0440\u0432\u044c|\u0432\u043e\u0441\u044c\u043c\u0438\u0440\u0430\u0443\u043d\u0434\u043e\u0432\u043e\u0433\u043e)\b/i
  }
];

function applyCaseAwareReplacement(value: string, replacements: ReplacementRule[]) {
  let next = value;

  for (const [pattern, replacement] of replacements) {
    next = next.replace(pattern, replacement);
  }

  return next;
}

export function enforceMmaTerminology(sourceText: string, localizedText: string) {
  const lowerSource = sourceText.toLowerCase();
  let next = localizedText;

  for (const rule of WEIGHT_CLASS_CORRECTION_RULES) {
    if (lowerSource.includes(rule.term)) {
      next = applyCaseAwareReplacement(next, rule.replacements);
    }
  }

  return next;
}

export function buildMmaGlossaryHints(sourceText: string) {
  const normalized = sourceText.toLowerCase();
  const matched = MMA_GLOSSARY.filter(([term]) => normalized.includes(term));
  if (matched.length === 0) {
    return [];
  }

  return [
    "Use this MMA glossary exactly when the source implies these terms:",
    ...matched.map(([term, translation]) => `- ${term} => ${translation}`)
  ];
}

export function collectMmaEditorialRedFlags(value: string) {
  return MMA_EDITORIAL_RED_FLAG_RULES.filter((rule) => rule.pattern.test(value)).map((rule) => rule.label);
}
