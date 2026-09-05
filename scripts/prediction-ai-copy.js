// Генерация редакционных текстов прогнозного снапшота из фактов базы.
// Модель получает только факт-пакет; ответ проходит валидацию, при любом
// сбое вызывающий код оставляет шаблонные тексты.

const crypto = require("node:crypto");
const verifiedCareers = require("./verified-fighter-careers.json");

const { collectRedFlags, enforceNameCorrections, latinShare } = require("./ai-text-quality");

const COPY_FIELDS = ["overview", "keyEdge", "fightScript", "pathA", "pathB"];
// Только однозначно букмекерская лексика: «ставка на борьбу» — обычная
// редакционная фраза, по ней не бракуем.
const BANNED_LEXICON = /букмекер|котировк|коэффициент|беттинг|сделать ставку|ставки принимаются|ставка зайд[её]т/i;
const MAX_ATTEMPTS = 3;
const FACT_PACK_VERSION = 4;

function pickName(fighter) {
  return String(fighter?.nameRu || fighter?.name || "").trim();
}

// Бои-заглушки («Opponent TBA vs TBA») оставляем на шаблонах: разбор без бойцов бессмыслен.
function isPlaceholderFight(fight) {
  return [fight?.fighterA, fight?.fighterB].some((fighter) =>
    /(?:^|[^\p{L}])(?:TBA|TBD)(?:[^\p{L}]|$)/iu.test(String(fighter?.name || ""))
  );
}

function buildFighterFacts(fighter, event) {
  const stats = {};
  if (fighter.sigStrikesLandedPerMin != null) stats.sigStrikesLandedPerMin = Number(fighter.sigStrikesLandedPerMin.toFixed(2));
  if (fighter.strikeAccuracy != null) stats.strikeAccuracy = Math.round(fighter.strikeAccuracy);
  if (fighter.strikeDefense != null) stats.strikeDefense = Math.round(fighter.strikeDefense);
  if (fighter.takedownAveragePer15 != null) stats.takedownAverage = Number(fighter.takedownAveragePer15.toFixed(2));
  if (fighter.takedownDefense != null) stats.takedownDefense = Math.round(fighter.takedownDefense);
  if (fighter.submissionAveragePer15 != null) stats.submissionAverage = Number(fighter.submissionAveragePer15.toFixed(2));

  // Пустая история не доказывает дебют. Карьерный контекст добавляем только
  // из проверенной записи с источниками и для событий не раньше проверки.
  const verified = verifiedCareers[String(fighter.espnId || "")];
  const eventDate = event?.date ? new Date(event.date).toISOString().slice(0, 10) : null;
  const career = verified?.name === fighter.name && eventDate >= verified.verifiedAt
    ? {
        ufcDebutDate: verified.ufcDebutDate,
        isUfcDebut: /^UFC\b/i.test(event?.name || "") && eventDate === verified.ufcDebutDate,
        achievements: verified.achievements
      }
    : null;

  return {
    name: pickName(fighter),
    record: String(fighter.record || "").trim() || null,
    age: Number(fighter.age) > 0 ? Number(fighter.age) : null,
    heightCm: Number(fighter.heightCm) > 0 ? Number(fighter.heightCm) : null,
    reachCm: Number(fighter.reachCm) > 0 ? Number(fighter.reachCm) : null,
    team: String(fighter.team || "").trim() || null,
    style: /^(?:--|tba|tbd)?$/i.test(String(fighter.style || "").trim()) ? null : fighter.style.trim(),
    stats,
    career,
    recentFights: (fighter.recentFights || []).slice(0, 3).map((entry) => ({
      opponent: String(entry.opponentNameRu || entry.opponentName || "").trim(),
      eventName: String(entry.eventName || "").trim() || null,
      result: entry.result || null,
      method: entry.method || null,
      round: entry.round || null,
      date: entry.date ? new Date(entry.date).toISOString().slice(0, 10) : null
    }))
  };
}

function describeCardSlot(fight) {
  if (fight.isMainEvent) return "главный бой турнира";
  const stage = String(fight.stage || "").trim().toLowerCase();
  if (stage === "main" || stage === "main_card") return "бой основного карда";
  if (stage) return "бой предварительного карда";
  return null;
}

// Котировок в факт-пакете сознательно НЕТ: пик модели должен быть независим
// от рыночной оценки, иначе она будет просто повторять фаворита.
function buildFightFactPack(fight) {
  return {
    eventName: String(fight.event?.name || "").trim(),
    eventDate: fight.event?.date
      ? new Date(fight.event.date).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })
      : null,
    weightClass: String(fight.weightClass || "").trim(),
    isHeadliner: Boolean(fight.isMainEvent),
    cardSlot: describeCardSlot(fight),
    fighters: [buildFighterFacts(fight.fighterA, fight.event), buildFighterFacts(fight.fighterB, fight.event)]
  };
}

function computeAiContentHash(fight, percents) {
  const band = percents?.percentA == null ? "na" : String(Math.round(percents.percentA / 10) * 10);
  const raw = JSON.stringify([FACT_PACK_VERSION, fight.fighterA?.id, fight.fighterB?.id, fight.eventId, band, buildFightFactPack(fight)]);
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function buildPrompt(pack) {
  const system = [
    "Ты — редактор русскоязычного MMA-медиа. Пишешь сухие, точные редакционные разборы боев UFC и делаешь собственный прогноз победителя.",
    "Верни СТРОГО валидный JSON без пояснений и markdown, с ключами: pick, pickReason, overview, keyEdge, fightScript, pathA, pathB.",
    'pick — строго "A" (первый боец в списке) или "B" (второй): кто, по твоему анализу, победит. Решай по статистике, форме, стилям и последним боям. Не бойся выбирать андердога, если матчап на это указывает.',
    "pickReason — 1-2 предложения (15-30 слов) на русском: главная причина выбора.",
    "Остальные значения — строки на русском языке.",
    "Имена бойцов пиши по-русски естественно и склоняй по правилам русского языка: мужские фамилии на согласный склоняются («победа Хукера», «против Парнасса»), женские фамилии на согласный и фамилии на -о, -е, -и не склоняются («против Дельфин Бенуаиш», «у Марио Пинто»). Не искажай написание имени из входных данных: меняй только окончание.",
    "Статус боя в карде бери из поля cardSlot дословно, не переименовывай его (не называй бой «со-главным», если это не указано).",
    "Запрещено упоминать букмекеров, ставки, коэффициенты и давать советы по ставкам.",
    "Запрещено использовать любые факты и числа, которых нет во входных данных: не выдумывай травмы, цитаты, титулы и историю встреч.",
    "Пустые поля и отсутствие статистики означают недостаток сведений у редакции, а не слабость бойца. Нельзя на этом основании объявлять его аутсайдером, менее опытным, менее надежным или давать преимущество сопернику.",
    "В опубликованном тексте не обсуждай наличие данных у редакции: запрещены формулировки «нет данных», «статистика отсутствует», «история боев неизвестна» и аналогичные. Объясняй выбор положительными известными фактами о бойцах.",
    "Дебют в UFC подтвержден только при career.isUfcDebut=true. Тогда прямо назови бой дебютом в UFC и учитывай career.achievements и выступления в других организациях. Дебютант UFC не равнозначен новичку MMA.",
    "В recentFights организация определяется по eventName: бои KSW, MVP и других промоушенов нельзя называть боями UFC. Чемпионство указывай только с организацией и весовыми категориями из career.achievements. Не сравнивай уровень оппозиции разных лиг без фактов.",
    "При неполных данных формулируй выбор осторожно и обосновывай только известными фактами: рекордом, антропометрией и подтвержденными результатами. Не придумывай стиль, скорость, план на бой и уровень прошлой оппозиции.",
    "В recentFights результат относится к самому бойцу: Поражение/loss не является его победой. Соблюдай даты и не называй старую победу последним выступлением.",
    "Рекорд не доказывает серию побед или текущую форму. Если recentFights пуст, запрещено приписывать бойцу последние победы, серию побед или поражений. Возраст сам по себе не доказывает скорость, выносливость, психологическую уверенность или пик формы.",
    "Если у любого участника нет recentFights или stats, формулируй выбор осторожно, без объяснений про недостаток данных. Подтвержденные бои за пределами UFC пригодны для анализа. Сценарии описывай как условия победы («если удастся»), а не как известный стиль или ожидаемое доминирование.",
    "Если данных мало — пиши короче, без воды."
  ].join("\n");

  const targetWords = pack.isHeadliner ? "40-80" : "25-50";
  const user = [
    `Ориентир для каждого текстового поля: ${targetWords} слов; при нехватке фактов допустимо 10-25 слов. Не повторяй оговорку о неполных данных во всех разделах.`,
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

  const pick = parsed.pick === "A" || parsed.pick === "B" ? parsed.pick : null;
  if (!pick) return { ok: false, reason: "invalid_pick" };
  const pickReason =
    typeof parsed.pickReason === "string" ? enforceNameCorrections(parsed.pickReason.trim()) : "";
  if (!pickReason) return { ok: false, reason: "empty_pick_reason" };

  const copy = {};
  for (const field of COPY_FIELDS) {
    const value = typeof parsed[field] === "string" ? enforceNameCorrections(parsed[field].trim()) : "";
    if (!value) return { ok: false, reason: `empty_${field}` };
    copy[field] = value;
  }

  const combined = [...COPY_FIELDS.map((field) => copy[field]), pickReason].join("\n");
  // У проспектов имя пока может быть только латиницей. Имя из факт-пакета
  // не является непереведённым текстом, остальная проза проверяется целиком.
  const proseLatinShare = (text) => latinShare(pack.fighters.reduce(
    (value, fighter) => fighter.name ? value.split(fighter.name).join("") : value, text
  ));
  const worstLatinShare = Math.max(...COPY_FIELDS.map((field) => proseLatinShare(copy[field])), proseLatinShare(pickReason));
  if (worstLatinShare > 0.2) return { ok: false, reason: "latin_share" };
  if (collectRedFlags(combined).length > 0) return { ok: false, reason: "red_flags" };
  if (BANNED_LEXICON.test(combined)) return { ok: false, reason: "banned_lexicon" };
  const biasedMissingData = combined.split(/[.!?\n]+/).some((sentence) =>
    /(?:отсутств|нехват|недостат|нет|мало)[^.!?]{0,70}(?:данн|статист|сведен)/i.test(sentence) &&
    /аутсайдер|слаб|менее (?:надеж|надёж|опыт|подготов)|выбор очевид|делает выбор|да[её]т преимущество/i.test(sentence) &&
    !/не (?:означает|делает|доказывает|свидетельствует|позволяет|да[её]т|говорит)/i.test(sentence)
  );
  if (biasedMissingData) return { ok: false, reason: "missing_data_bias" };
  const missingDataClaim = /(?:нет|отсутств\p{L}*|нехват\p{L}*|недостат\p{L}*|мало|без)[^.!?\n]{0,70}(?:данн\p{L}*|статист\p{L}*|сведен\p{L}*|истори\p{L}*)|(?:данн\p{L}*|статист\p{L}*|сведен\p{L}*|истори\p{L}*)[^.!?\n]{0,50}(?:отсутств\p{L}*|неизвест\p{L}*|не (?:представлен\p{L}*|загружен\p{L}*|доступн\p{L}*))/iu;
  if (missingDataClaim.test(combined)) return { ok: false, reason: "editorial_data_gap" };
  if (!pack.fighters.some((fighter) => fighter.career?.isUfcDebut) && /дебют\p{L}*[^.!?\n]{0,35}UFC|UFC[^.!?\n]{0,20}дебют\p{L}*/iu.test(combined)) {
    return { ok: false, reason: "unverified_ufc_debut" };
  }
  const hasKnownWinningStreak = pack.fighters.some((fighter) =>
    fighter.recentFights.length >= 2 && fighter.recentFights.slice(0, 2).every((fight) => /^(?:win|побед)/i.test(fight.result || ""))
  );
  if (!hasKnownWinningStreak && /сери[яиюей]+ (?:из \d+ )?побед|победн\p{L}* сери/iu.test(combined)) {
    return { ok: false, reason: "unsupported_winning_streak" };
  }
  if (/пик[ае]? формы|расцвет[ае]? (?:карьеры|сил)|уверенность в (?:себе|своих силах)/i.test(combined)) {
    return { ok: false, reason: "unsupported_condition" };
  }
  if (pack.fighters.some((fighter) => !fighter.recentFights.length) && /лучш\p{L}* форме|уступает в свежести|более свеж|преимущество в свежести|лучше подготовлен/iu.test(combined)) {
    return { ok: false, reason: "unsupported_condition" };
  }

  const allowed = new Set(extractNumbers(JSON.stringify(pack)));
  for (const round of ["1", "2", "3", "4", "5"]) allowed.add(round);
  for (const record of pack.fighters.map((fighter) => fighter.record).filter(Boolean)) {
    for (const chunk of record.split("-")) allowed.add(String(Number(chunk)));
  }
  const foreign = extractNumbers(combined).filter(
    (token) => !allowed.has(token) && !allowed.has(String(Number(token)))
  );
  if (foreign.length > 0) return { ok: false, reason: "foreign_numbers" };

  const maxWords = pack.isHeadliner ? 280 : 150;
  const totalWords = COPY_FIELDS.map((field) => copy[field])
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
  const perFieldAverage = totalWords / COPY_FIELDS.length;
  if (perFieldAverage < 8 || perFieldAverage > maxWords) return { ok: false, reason: "length" };

  return { ok: true, copy, pick, pickReason };
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

async function generateAiPredictionCopy({ fight, config, fetchImpl = fetch }) {
  if (isPlaceholderFight(fight)) {
    return null;
  }

  const pack = buildFightFactPack(fight);
  const prompt = buildPrompt(pack);
  let correction = null;

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
          temperature: 0.2,
          messages: [
            { role: "system", content: prompt.system },
            { role: "user", content: prompt.user + (correction ? `\n\nПредыдущий ответ отклонен: ${correction}. Напиши новый разбор, строго ограниченный фактами. Не сравнивай форму и свежесть при пустой истории, не выдумывай серии побед. Допустим короткий осторожный текст.` : "") }
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
      console.warn(`[ai-copy] rejected (${verdict.reason}): ${pack.fighters[0]?.name} vs ${pack.fighters[1]?.name}`);
      correction = verdict.reason;
      if (attempt === MAX_ATTEMPTS) return null;
      continue;
    }
    return { copy: verdict.copy, pick: verdict.pick, pickReason: verdict.pickReason, pack };
  }

  return null;
}

/**
 * Конфиг провайдера для пика и текстов прогноза. Отдельные переменные, чтобы прогнозы
 * могли жить на другой модели, чем новости:
 *   PREDICTION_AI_COPY=0 — выключить генерацию;
 *   PREDICTION_AI_PROVIDER — codex | deepseek, по умолчанию AI_PROVIDER;
 *   PREDICTION_AI_MODEL — модель, по умолчанию CODEX_BRIDGE_MODEL / DEEPSEEK_MODEL;
 *   PREDICTION_AI_TIMEOUT_MS — таймаут одного запроса.
 * Фолбэка между провайдерами намеренно нет: пик должен приходить от одной модели.
 */
function resolvePredictionAiConfig(readEnv) {
  if (readEnv("PREDICTION_AI_COPY", "1").trim() === "0") return null;
  const provider = readEnv("PREDICTION_AI_PROVIDER", "").trim().toLowerCase() || readEnv("AI_PROVIDER", "").trim().toLowerCase();
  const timeoutMs = Number(readEnv("PREDICTION_AI_TIMEOUT_MS", "60000")) || 60000;
  const modelOverride = readEnv("PREDICTION_AI_MODEL", "").trim();

  if (provider === "codex") {
    const baseUrl = readEnv("CODEX_BRIDGE_URL", "").trim();
    const apiKey = readEnv("CODEX_BRIDGE_TOKEN", "").trim();
    if (!baseUrl || !apiKey) return null;
    return {
      provider,
      baseUrl,
      apiKey,
      model: modelOverride || readEnv("CODEX_BRIDGE_MODEL", "gpt-5.3-codex-spark").trim(),
      timeoutMs
    };
  }

  if (provider === "deepseek") {
    const apiKey = readEnv("DEEPSEEK_API_KEY", "").trim();
    if (!apiKey) return null;
    return {
      provider,
      baseUrl: readEnv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
      apiKey,
      model: modelOverride || readEnv("DEEPSEEK_MODEL", "deepseek-chat").trim(),
      timeoutMs
    };
  }

  return null;
}

module.exports = {
  buildFightFactPack,
  computeAiContentHash,
  buildPrompt,
  isPlaceholderFight,
  validateAiCopy,
  generateAiPredictionCopy,
  resolvePredictionAiConfig
};
