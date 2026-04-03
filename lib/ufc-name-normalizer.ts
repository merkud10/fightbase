import ufcNameDictionary from "@/lib/ufc-name-dictionary.json";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const UFC_NAME_RED_FLAG_RULES: Array<{ label: string; pattern: RegExp }> = [
  { label: "bad_name_variant", pattern: /\b(?:\u0410\u0439\u0441\u0443\u043b\u0442\u0430\u043d|\u0426\u0441\u0430\u0440\u0443\u043a\u044f\u043d)\b/i },
  { label: "bad_chris_variant", pattern: /\b\u0427\u0440\u0438\u0441(?:\u0430|\u0443|\u043e\u043c|\u0435)?\b/i },
  { label: "bad_sean_variant", pattern: /\b\u0421\u0435\u0430\u043d(?:\u0430|\u0443|\u043e\u043c|\u0435)?\b/i },
  { label: "bad_alexander_variant", pattern: /\b\u0410\u043b\u0435\u043a\u0441\u0430\u043d\u0434\u0435\u0440(?:\u0430|\u0443|\u043e\u043c|\u0435)?\b/i },
  { label: "bad_eryk_variant", pattern: /\b\u0415\u0440\u0438\u043a \u0410\u043d\u0434\u0435\u0440\u0441\b/i },
  { label: "bad_ciryl_variant", pattern: /\b\u041a\u0438\u0440\u0438\u043b \u0413\u0430\u043d\u0435\b/i },
  { label: "bad_sergei_variant", pattern: /\b\u0421\u0435\u0440\u0433\u0435\u0438 \u041f\u0430\u0432\u043b\u043e\u0432\u0438\u0447\b/i },
  { label: "bad_charles_variant", pattern: /\b\u0427\u0430\u0440\u043b\u0435\u0441 \u041e\u043b\u0438\u0432\u0435[\u0438\u0439]\u0440\u0430\b/i },
  { label: "bad_curtis_variant", pattern: /\b\u041a\u0443\u0440\u0442\u0438\u0441(?:\u0430|\u0443|\u043e\u043c|\u0435)?\b/i },
  { label: "bad_belal_variant", pattern: /\b\u0411\u0435\u043b\u044f\u043b\u044c(?:\u044f|\u044e|\u0435\u043c|\u0435)?\b/i },
  { label: "bad_merab_variant", pattern: /\b\u041c\u044d\u0440\u0430\u0431(?:\u0430|\u0443|\u043e\u043c|\u0435)?\b/i },
  { label: "bad_jamahal_variant", pattern: /\b\u0414\u0436\u0430\u043c\u0430\u0445\u0430\u043b(?:\u0430|\u0443|\u043e\u043c|\u0435)?\b/i }
];

export function normalizeUfcNameText(value: string) {
  let next = String(value || "")
    .replace(/\bЧриса\b/gi, "Криса")
    .replace(/\bЧрису\b/gi, "Крису")
    .replace(/\bЧрисом\b/gi, "Крисом")
    .replace(/\bЧрисе\b/gi, "Крисе")
    .replace(/\bЧрис\b/gi, "Крис")
    .replace(/\bСеана\b/gi, "Шона")
    .replace(/\bСеану\b/gi, "Шону")
    .replace(/\bСеаном\b/gi, "Шоном")
    .replace(/\bСеане\b/gi, "Шоне")
    .replace(/\bСеан\b/gi, "Шон")
    .replace(/\bАлександера\b/gi, "Александра")
    .replace(/\bАлександеру\b/gi, "Александру")
    .replace(/\bАлександером\b/gi, "Александром")
    .replace(/\bАлександере\b/gi, "Александре")
    .replace(/\bАлександер\b/gi, "Александр")
    .replace(/\bКуртиса\b/gi, "Кертиса")
    .replace(/\bКуртису\b/gi, "Кертису")
    .replace(/\bКуртисом\b/gi, "Кертисом")
    .replace(/\bКуртисе\b/gi, "Кертисе")
    .replace(/\bКуртис\b/gi, "Кертис")
    .replace(/\bБеляля\b/gi, "Белала")
    .replace(/\bБелялю\b/gi, "Белалу")
    .replace(/\bБелялем\b/gi, "Белалом")
    .replace(/\bБеляле\b/gi, "Белале")
    .replace(/\bБеляль\b/gi, "Белал")
    .replace(/\bМэраба\b/gi, "Мераба")
    .replace(/\bМэрабу\b/gi, "Мерабу")
    .replace(/\bМэрабом\b/gi, "Мерабом")
    .replace(/\bМэрабе\b/gi, "Мерабе")
    .replace(/\bМэраб\b/gi, "Мераб")
    .replace(/\bДжамахала\b/gi, "Джамала")
    .replace(/\bДжамахалу\b/gi, "Джамалу")
    .replace(/\bДжамахалом\b/gi, "Джамалом")
    .replace(/\bДжамахале\b/gi, "Джамале")
    .replace(/\bДжамахал\b/gi, "Джамал");

  for (const [englishName, russianName] of Object.entries(ufcNameDictionary.fullNames)) {
    next = next.replace(new RegExp(`\\b${escapeRegExp(englishName)}\\b`, "g"), russianName);
  }

  for (const [wrongValue, correctValue] of Object.entries(ufcNameDictionary.ruCorrections || {})) {
    next = next.replace(new RegExp(`\\b${escapeRegExp(wrongValue)}\\b`, "g"), correctValue);
  }

  return next;
}

export function buildUfcNameGuide() {
  const tokenRules = Object.entries(ufcNameDictionary.tokens)
    .map(([english, russian]) => `${english} as ${russian}`)
    .join(", ");

  const fullNameRules = Object.entries(ufcNameDictionary.fullNames)
    .slice(0, 12)
    .map(([english, russian]) => `${english} as ${russian}`)
    .join(", ");

  return {
    tokenLine: `Always write ${tokenRules}.`,
    fullNameLine: `Preferred UFC name forms include ${fullNameRules}.`
  };
}

export function collectUfcNameRedFlags(value: string) {
  return UFC_NAME_RED_FLAG_RULES.filter((rule) => rule.pattern.test(value)).map((rule) => rule.label);
}
