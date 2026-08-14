// Генерация редакционных текстов прогнозного снапшота из фактов базы.
// Модель получает только факт-пакет; ответ проходит валидацию, при любом
// сбое вызывающий код оставляет шаблонные тексты.

const crypto = require("node:crypto");

const { collectRedFlags, enforceNameCorrections, latinShare } = require("./ai-text-quality");

const COPY_FIELDS = ["overview", "keyEdge", "fightScript", "pathA", "pathB"];
// Только однозначно букмекерская лексика: «ставка на борьбу» — обычная
// редакционная фраза, по ней не бракуем.
const BANNED_LEXICON = /букмекер|котировк|коэффициент|беттинг|сделать ставку|ставки принимаются|ставка зайд[её]т/i;
const MAX_ATTEMPTS = 3;

function pickName(fighter) {
  return String(fighter?.nameRu || fighter?.name || "").trim();
}

// Бои-заглушки («Opponent TBA vs TBA») оставляем на шаблонах: разбор без бойцов бессмыслен.
function isPlaceholderFight(fight) {
  return [fight?.fighterA, fight?.fighterB].some((fighter) =>
    /(?:^|[^\p{L}])(?:TBA|TBD)(?:[^\p{L}]|$)/iu.test(String(fighter?.name || ""))
  );
}

function buildFighterFacts(fighter) {
  const stats = {};
  if (fighter.sigStrikesLandedPerMin != null) stats.sigStrikesLandedPerMin = Number(fighter.sigStrikesLandedPerMin.toFixed(2));
  if (fighter.strikeAccuracy != null) stats.strikeAccuracy = Math.round(fighter.strikeAccuracy);
  if (fighter.strikeDefense != null) stats.strikeDefense = Math.round(fighter.strikeDefense);
  if (fighter.takedownAveragePer15 != null) stats.takedownAverage = Number(fighter.takedownAveragePer15.toFixed(2));
  if (fighter.takedownDefense != null) stats.takedownDefense = Math.round(fighter.takedownDefense);
  if (fighter.submissionAveragePer15 != null) stats.submissionAverage = Number(fighter.submissionAveragePer15.toFixed(2));

  return {
    name: pickName(fighter),
    record: String(fighter.record || "").trim() || null,
    stats,
    recentFights: (fighter.recentFights || []).slice(0, 3).map((entry) => ({
      opponent: String(entry.opponentNameRu || entry.opponentName || "").trim(),
      result: entry.result || null,
      method: entry.method || null
    }))
  };
}

function describeCardSlot(fight) {
  if (fight.isMainEvent) return "главный бой турнира";
  const stage = String(fight.stage || "").trim().toLowerCase();
  if (stage === "main") return "бой основного карда";
  if (stage) return "бой предварительного карда";
  return null;
}

function buildFightFactPack(fight, percents) {
  return {
    eventName: String(fight.event?.name || "").trim(),
    eventDate: fight.event?.date
      ? new Date(fight.event.date).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })
      : null,
    weightClass: String(fight.weightClass || "").trim(),
    isHeadliner: Boolean(fight.isMainEvent),
    cardSlot: describeCardSlot(fight),
    fighters: [buildFighterFacts(fight.fighterA), buildFighterFacts(fight.fighterB)],
    percentA: percents?.percentA ?? null,
    percentB: percents?.percentB ?? null,
    percentSource: percents?.source ?? null
  };
}

function computeAiContentHash(fight, percents) {
  const band = percents?.percentA == null ? "na" : String(Math.round(percents.percentA / 10) * 10);
  const raw = [fight.fighterA?.id, fight.fighterB?.id, fight.eventId, band].join("|");
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function buildPrompt(pack) {
  const system = [
    "Ты — редактор русскоязычного MMA-медиа. Пишешь сухие, точные редакционные разборы боев UFC.",
    "Верни СТРОГО валидный JSON без пояснений и markdown, с ключами: overview, keyEdge, fightScript, pathA, pathB. Все значения — строки на русском языке.",
    "Имена бойцов используй только в именительном падеже: перестраивай фразу, а не склоняй имя. Избегай конструкций, где имя требует другого падежа («у {имя}», «за {имя}», «против {имя}») — делай имя подлежащим.",
    "Статус боя в карде бери из поля cardSlot дословно, не переименовывай его (не называй бой «со-главным», если это не указано).",
    "Запрещено упоминать букмекеров, ставки, коэффициенты и давать советы по ставкам.",
    "Запрещено использовать любые факты и числа, которых нет во входных данных: не выдумывай травмы, цитаты, титулы и историю встреч.",
    "Если данных мало — пиши короче, без воды."
  ].join("\n");

  const targetWords = pack.isHeadliner ? "120-160" : "60-90";
  const user = [
    `Целевая длина каждого поля: ${targetWords} слов.`,
    "Поля: overview — общая картина матчапа; keyEdge — главное преимущество и за кем оно; fightScript — вероятное развитие боя; pathA — путь к победе первого бойца; pathB — путь к победе второго.",
    "",
    "Факты (используй только их):",
    JSON.stringify(pack, null, 1)
  ].join("\n");

  return { system, user };
}

function extractNumbers(text) {
  return (String(text || "").match(/\d+(?:[.,]\d+)?/g) || []).map((token) => token.replace(",", "."));
}

function validateAiCopy(parsed, pack) {
  if (!parsed || typeof parsed !== "object") return { ok: false, reason: "not_an_object" };

  const copy = {};
  for (const field of COPY_FIELDS) {
    const value = typeof parsed[field] === "string" ? enforceNameCorrections(parsed[field].trim()) : "";
    if (!value) return { ok: false, reason: `empty_${field}` };
    copy[field] = value;
  }

  const combined = COPY_FIELDS.map((field) => copy[field]).join("\n");
  if (latinShare(combined) > 0.1) return { ok: false, reason: "latin_share" };
  if (collectRedFlags(combined).length > 0) return { ok: false, reason: "red_flags" };
  if (BANNED_LEXICON.test(combined)) return { ok: false, reason: "banned_lexicon" };

  const allowed = new Set(extractNumbers(JSON.stringify(pack)));
  for (const round of ["1", "2", "3", "4", "5"]) allowed.add(round);
  for (const record of pack.fighters.map((fighter) => fighter.record).filter(Boolean)) {
    for (const chunk of record.split("-")) allowed.add(String(Number(chunk)));
  }
  const foreign = extractNumbers(combined).filter(
    (token) => !allowed.has(token) && !allowed.has(String(Number(token)))
  );
  if (foreign.length > 0) return { ok: false, reason: "foreign_numbers" };

  const [minWords, maxWords] = pack.isHeadliner ? [70, 280] : [38, 150];
  const totalWords = combined.split(/\s+/).filter(Boolean).length;
  const perFieldAverage = totalWords / COPY_FIELDS.length;
  if (perFieldAverage < minWords * 0.3 || perFieldAverage > maxWords) return { ok: false, reason: "length" };

  return { ok: true, copy };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseModelJson(content) {
  const raw = String(content || "").trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const sanitized = fenced?.[1]?.trim() ?? raw;
  try {
    return JSON.parse(sanitized);
  } catch {
    const start = sanitized.indexOf("{");
    const end = sanitized.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(sanitized.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function generateAiPredictionCopy({ fight, percents, config, fetchImpl = fetch }) {
  if (isPlaceholderFight(fight)) {
    return null;
  }

  const pack = buildFightFactPack(fight, percents);
  const prompt = buildPrompt(pack);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        signal: AbortSignal.timeout(config.timeoutMs ?? 30000),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          temperature: 0.4,
          messages: [
            { role: "system", content: prompt.system },
            { role: "user", content: prompt.user }
          ]
        })
      });
    } catch {
      if (attempt === MAX_ATTEMPTS) return null;
      await sleep((config.retryDelayMs ?? 2000) * attempt);
      continue;
    }

    if (!response.ok) {
      if (attempt === MAX_ATTEMPTS) return null;
      await sleep((config.retryDelayMs ?? 2000) * attempt);
      continue;
    }

    const payload = await response.json();
    const parsed = parseModelJson(payload?.choices?.[0]?.message?.content);
    const verdict = validateAiCopy(parsed, pack);
    if (!verdict.ok) {
      // Невалидный контент не ретраим: причина детерминированная, лучше шаблон.
      console.warn(`[ai-copy] rejected (${verdict.reason}): ${pack.fighters[0]?.name} vs ${pack.fighters[1]?.name}`);
      return null;
    }
    return { copy: verdict.copy, pack };
  }

  return null;
}

module.exports = {
  buildFightFactPack,
  computeAiContentHash,
  buildPrompt,
  isPlaceholderFight,
  validateAiCopy,
  generateAiPredictionCopy
};
