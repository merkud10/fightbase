// Приводит фразу о рекорде в биографии бойца к текущему рекорду из профиля.
// Биографии пишутся один раз, рекорд обновляется синком после каждого боя:
// на проде (сентябрь 2026) у ~500 бойцов текст расходился с цифрой в шапке
// («рекорд составляет 20 побед» при 21-7-1). Меняем только общий рекорд после
// слова «рекорд»/«record»; рекорд в UFC и числа нокаутов/сабмишенов не трогаем.

function parseRecord(record) {
  const match = String(record || "").match(/^\s*(\d+)-(\d+)(?:-(\d+))?/);
  if (!match) return null;
  return { wins: Number(match[1]), losses: Number(match[2]), draws: Number(match[3] || 0) };
}

function ruPlural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} ${one}`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} ${few}`;
  return `${n} ${many}`;
}

function enPlural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

// «В UFC его рекорд 5-2-0», «рекорд 0-1-0 в организации» — это не общий рекорд.
const RU_PROMOTION_SCOPE = /в\s+(?:ufc|юфс|организации|промоушене)/i;
const EN_PROMOTION_SCOPE = /\b(?:in\s+(?:the\s+)?(?:ufc|promotion|organization)|ufc\s+record)\b/i;

function isPromotionScoped(text, start, end, scope) {
  const before = text.slice(Math.max(0, start - 25), start);
  const after = text.slice(end, end + 25);
  return scope.test(before) || scope.test(text.slice(start, end)) || /^\s*(?:в\s+(?:ufc|юфс|организации)|in\s+(?:the\s+)?(?:ufc|promotion))/i.test(after);
}

function syncRu(text, rec) {
  const dashed = /(рекорд[а-яё]*[^.\d]{0,40}?)(\d{1,2})-(\d{1,2})(?:-(\d{1,2}))?(?![\d-])/giu;
  let out = text.replace(dashed, (match, lead, w, l, d, offset) => {
    if (isPromotionScoped(text, offset, offset + match.length, RU_PROMOTION_SCOPE)) return match;
    return `${lead}${rec.wins}-${rec.losses}-${rec.draws}`;
  });

  // «13 побед при 3 поражениях» — отдельная форма с предложным падежом.
  const withPri = /(рекорд[а-яё]*[^.\d]{0,40}?)(\d+)\s+побед[аы]?\s+при\s+(\d+)\s+поражени(?:ях|и)/giu;
  out = out.replace(withPri, (match, lead, w, l, offset) => {
    if (isPromotionScoped(out, offset, offset + match.length, RU_PROMOTION_SCOPE)) return match;
    const winsText = ruPlural(rec.wins, "победа", "победы", "побед");
    return `${lead}${winsText} при ${rec.losses} ${rec.losses % 10 === 1 && rec.losses % 100 !== 11 ? "поражении" : "поражениях"}`;
  });

  const words =
    /(рекорд[а-яё]*[^.\d]{0,40}?)(\d+)\s+побед[аы]?(,?\s*(?:и\s+)?)(\d+)\s+поражени[еяй](?![а-яё])(?:,?\s*(?:и\s+)?(\d+|одн[а-яё]{1,2})\s+ничь(?:их|ей|ю|я|и)(?![а-яё]))?/giu;
  out = out.replace(words, (match, lead, w, sep, l, d, offset) => {
    if (isPromotionScoped(out, offset, offset + match.length, RU_PROMOTION_SCOPE)) return match;
    const winsText = ruPlural(rec.wins, "победа", "победы", "побед");
    const lossesText = ruPlural(rec.losses, "поражение", "поражения", "поражений");
    if (rec.draws > 0) {
      return `${lead}${winsText}, ${lossesText} и ${ruPlural(rec.draws, "ничья", "ничьи", "ничьих")}`;
    }
    return `${lead}${winsText} и ${lossesText}`;
  });

  return out;
}

function syncEn(text, rec) {
  const dashed = /(record[^.\d]{0,40}?)(\d{1,2})-(\d{1,2})(?:-(\d{1,2}))?(?![\d-])/gi;
  let out = text.replace(dashed, (match, lead, w, l, d, offset) => {
    if (isPromotionScoped(text, offset, offset + match.length, EN_PROMOTION_SCOPE)) return match;
    return `${lead}${rec.wins}-${rec.losses}-${rec.draws}`;
  });

  const words = /(record[^.\d]{0,40}?)(\d+)\s+wins?(,?\s*(?:and\s+)?)(\d+)\s+loss(?:es)?(?:,?\s*(?:and\s+)?(\d+)\s+draws?)?/gi;
  out = out.replace(words, (match, lead, w, sep, l, d, offset) => {
    if (isPromotionScoped(out, offset, offset + match.length, EN_PROMOTION_SCOPE)) return match;
    const winsText = enPlural(rec.wins, "win", "wins");
    const lossesText = enPlural(rec.losses, "loss", "losses");
    if (rec.draws > 0) return `${lead}${winsText}, ${lossesText} and ${enPlural(rec.draws, "draw", "draws")}`;
    return `${lead}${winsText} and ${lossesText}`;
  });

  return out;
}

function syncBioRecord(text, record, locale = "ru") {
  const rec = parseRecord(record);
  // «0-0-0(В-П-Н)» — заглушка вместо рекорда, по ней текст не переписываем.
  if (!text || !rec || rec.wins + rec.losses + rec.draws === 0) return text;
  return locale === "en" ? syncEn(text, rec) : syncRu(text, rec);
}

module.exports = { syncBioRecord, parseRecord };
