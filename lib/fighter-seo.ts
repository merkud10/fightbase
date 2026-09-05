// SEO-строки карточки бойца под запрос-имя. По Search Console (июнь–сентябрь
// 2026) карточки собирали 180 тыс. показов по запросам вида «сонг ядонг» при
// CTR 0.16%: заголовок и описание должны сразу отвечать, кто это, какой рекорд,
// какая позиция и когда следующий бой.

import { formatWeightClass } from "@/lib/display";
import type { Locale } from "@/lib/locale-config";
import { isPoundForPoundRankingGroup } from "@/lib/ufc-rankings";

export type FighterRanking = { division: string; rank: number; champion: boolean };

type RankingGroupLike = {
  title: string;
  champion: { name: string; officialSlug: string };
  rows: ReadonlyArray<{ rank: number; name: string; officialSlug: string }>;
};

// Позиция бойца в дивизионном рейтинге по снимку UFC. P4P пропускаем: это не
// дивизион. resolveSlug переводит официальный слаг или имя в наш слаг.
export function findFighterRanking(
  groups: ReadonlyArray<RankingGroupLike>,
  resolveSlug: (officialSlug: string, name: string) => string | null | undefined,
  localSlug: string
): FighterRanking | null {
  for (const group of groups) {
    if (isPoundForPoundRankingGroup(group.title)) {
      continue;
    }
    if (group.champion.name && resolveSlug(group.champion.officialSlug, group.champion.name) === localSlug) {
      return { division: group.title, rank: 0, champion: true };
    }
    for (const row of group.rows) {
      if (resolveSlug(row.officialSlug, row.name) === localSlug) {
        return { division: group.title, rank: row.rank, champion: false };
      }
    }
  }
  return null;
}

// Русские падежи названия дивизиона: «Легчайший вес» → «легчайшего веса» /
// «легчайшем весе». Прилагательные на -ий после н/ш склоняются мягко.
function divisionCase(title: string, form: "genitive" | "prepositional") {
  const words = title.trim().toLowerCase().split(/\s+/);
  return words
    .map((word) => {
      if (word === "вес") return form === "genitive" ? "веса" : "весе";
      if (word === "женский") return form === "genitive" ? "женского" : "женском";
      if (word.endsWith("ий")) {
        const soft = /[нш]ий$/.test(word);
        const stem = word.slice(0, -2);
        return form === "genitive" ? `${stem}${soft ? "его" : "ого"}` : `${stem}${soft ? "ем" : "ом"}`;
      }
      if (word.endsWith("ый")) {
        const stem = word.slice(0, -2);
        return form === "genitive" ? `${stem}ого` : `${stem}ом`;
      }
      return word;
    })
    .join(" ");
}

function ageLabel(age: number, locale: Locale) {
  if (locale !== "ru") return `${age} years`;
  const mod10 = age % 10;
  const mod100 = age % 100;
  const word = mod100 >= 11 && mod100 <= 14 ? "лет" : mod10 === 1 ? "год" : mod10 >= 2 && mod10 <= 4 ? "года" : "лет";
  return `${age} ${word}`;
}

function rankLabel(ranking: FighterRanking, locale: Locale) {
  if (ranking.champion) return locale === "ru" ? "Чемпион UFC" : "UFC champion";
  return locale === "ru"
    ? `№${ranking.rank} ${divisionCase(ranking.division, "genitive")}`
    : `#${ranking.rank} ${formatWeightClass(ranking.division, "en").toLowerCase()}`;
}

export type FighterSeoInput = {
  fighter: {
    name: string;
    nameRu: string | null;
    nickname: string | null;
    record: string | null;
    weightClass: string;
    country: string | null;
    age: number | null;
    team: string | null;
    status: string;
  };
  ranking: FighterRanking | null;
  nextFight: { opponentName: string; eventName: string; dateLabel: string } | null;
  lastFight: { opponentName: string; result: string; dateLabel: string } | null;
  locale: Locale;
};

export function buildFighterSeo({ fighter, ranking, nextFight, lastFight, locale }: FighterSeoInput) {
  const ru = locale === "ru";
  const displayName = (ru ? fighter.nameRu : null) ?? fighter.name;
  const fullName = ru && fighter.nameRu ? `${fighter.nameRu} (${fighter.name})` : fighter.name;
  const record = fighter.record?.trim() || null;
  const weightClass = formatWeightClass(fighter.weightClass, locale);
  const nickname = fighter.nickname?.trim() || null;
  const country = fighter.country?.trim() || null;

  const title = ru
    ? record
      ? `${fullName}: рекорд ${record}, статистика и бои UFC`
      : `${fullName}: статистика и бои UFC`
    : record
      ? `${fullName}: UFC record ${record}, stats and fights`
      : `${fullName}: UFC record, stats and fights`;

  const heroBits = [
    ranking ? rankLabel(ranking, locale) : null,
    record,
    weightClass,
    country,
    fighter.age ? ageLabel(fighter.age, locale) : null,
    fighter.team?.trim() || null
  ].filter((bit): bit is string => Boolean(bit));

  const lead: string[] = [];
  if (ru) {
    const who = `${displayName}${nickname ? ` «${nickname}»` : ""}`;
    const role = ranking?.champion
      ? `чемпион UFC в ${divisionCase(ranking.division, "prepositional")}`
      : ranking
        ? `боец UFC${country ? ` (${country})` : ""}, №${ranking.rank} ${divisionCase(ranking.division, "genitive")}`
        : `боец UFC${country ? ` (${country})` : ""}, ${weightClass.toLowerCase()}`;
    const tail = [record ? `рекорд ${record}` : null, fighter.age ? ageLabel(fighter.age, "ru") : null].filter(Boolean).join(", ");
    lead.push(`${who} — ${role}${tail ? `, ${tail}` : ""}.`);
    if (nextFight) {
      lead.push(`Следующий бой: ${nextFight.opponentName}, ${nextFight.eventName}, ${nextFight.dateLabel}.`);
    } else if (lastFight) {
      const result = lastFight.result.toLowerCase();
      const verb = /побед/.test(result) ? "победа над" : /пораж/.test(result) ? "поражение от" : `${result} против`;
      lead.push(`Последний бой: ${verb} ${lastFight.opponentName}, ${lastFight.dateLabel}.`);
    }
    lead.push("Статистика UFC, последние бои, параметры и прогнозы FightBase.");
  } else {
    const who = `${fighter.name}${nickname ? ` "${nickname}"` : ""}`;
    const role = ranking?.champion
      ? `UFC ${weightClass.toLowerCase()} champion`
      : ranking
        ? `UFC ${weightClass.toLowerCase()} fighter ranked #${ranking.rank}`
        : `UFC ${weightClass.toLowerCase()} fighter`;
    const tail = [country ? `from ${country}` : null, record ? `record ${record}` : null, fighter.age ? ageLabel(fighter.age, "en") : null].filter(Boolean).join(", ");
    lead.push(`${who} — ${role}${tail ? `, ${tail}` : ""}.`);
    if (nextFight) {
      lead.push(`Next fight: ${nextFight.opponentName}, ${nextFight.eventName}, ${nextFight.dateLabel}.`);
    } else if (lastFight) {
      lead.push(`Last fight: ${lastFight.result.toLowerCase()} vs ${lastFight.opponentName}, ${lastFight.dateLabel}.`);
    }
    lead.push("UFC stats, recent fights, measurements and FightBase picks.");
  }

  return { title, description: lead.join(" "), heroBits };
}
