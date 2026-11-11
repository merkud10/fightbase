// История боёв бойца из наших собственных записей Fight — запасной источник для
// карточки. Основная история (FighterRecentFight) приходит из синка профилей раз
// в неделю, поэтому в ночь турнира свежего боя в ней ещё нет, а у бойца, которого
// импорт карда завёл новой записью, нет вовсе: по Метрике (07–08.11.2026) такие
// карточки открывали из поиска в день боя и уходили за 8 секунд.

import { isPlaceholderFightSlug } from "@/lib/sitemap-entries";

type FightSide = { slug: string; name: string; nameRu: string | null };

export type OwnFight = {
  id: string;
  slug: string | null;
  status: string;
  resultType: string | null;
  winnerFighterId: string | null;
  method: string | null;
  resultRound: number | null;
  resultTime: string | null;
  weightClass: string;
  fighterAId: string;
  fighterBId: string;
  fighterA: FightSide | null;
  fighterB: FightSide | null;
  event: { name: string; slug: string; date: Date };
  predictionSnapshot: { id: string } | null;
};

export type OwnHistoryEntry = {
  id: string;
  opponentName: string;
  opponentNameRu: string | null;
  opponentSlug: string | null;
  eventName: string;
  eventSlug: string | null;
  predictionSlug: string | null;
  date: Date;
  result: string;
  method: string | null;
  round: number | null;
  time: string | null;
  weightClass: string | null;
};

function resultLabel(fight: OwnFight, fighterId: string) {
  if (fight.resultType === "draw") return "Ничья";
  if (fight.resultType === "no_contest") return "Несостоявшийся бой";
  if (!fight.winnerFighterId) return null;
  return fight.winnerFighterId === fighterId ? "Победа" : "Поражение";
}

// Завершённые бои с известным исходом, от свежих к старым.
export function buildHistoryFromOwnFights(fights: readonly OwnFight[], fighterId: string): OwnHistoryEntry[] {
  const entries: OwnHistoryEntry[] = [];

  for (const fight of fights) {
    if (fight.status !== "completed" || !Number.isFinite(fight.event.date.getTime())) continue;
    const opponent = fight.fighterAId === fighterId ? fight.fighterB : fight.fighterBId === fighterId ? fight.fighterA : null;
    if (!opponent?.name.trim() || isPlaceholderFightSlug(opponent.slug)) continue;
    const result = resultLabel(fight, fighterId);
    if (!result) continue;

    entries.push({
      id: `own-${fight.id}`,
      opponentName: opponent.name,
      opponentNameRu: opponent.nameRu,
      opponentSlug: opponent.slug,
      eventName: fight.event.name,
      eventSlug: fight.event.slug || null,
      predictionSlug: fight.predictionSnapshot && fight.slug ? fight.slug : null,
      date: fight.event.date,
      result,
      method: fight.method,
      round: fight.resultRound,
      time: fight.resultTime,
      weightClass: fight.weightClass || null
    });
  }

  return entries.sort((a, b) => b.date.getTime() - a.date.getTime());
}

// Дата в истории профиля — календарный день боя, у турнира — время начала:
// один и тот же бой может расходиться на сутки-двое из-за часовых поясов.
const SAME_FIGHT_WINDOW_MS = 3 * 86_400_000;

// Добавляет к истории профиля наши бои, которых в ней ещё нет. Берём только бои
// новее самой свежей записи профиля: более старые расхождения — это уже разные
// версии одной истории, и склейка плодила бы повторы.
export function mergeOwnFightsIntoHistory<T extends { date: Date }>(
  profileHistory: readonly T[],
  ownHistory: readonly OwnHistoryEntry[]
): Array<T | OwnHistoryEntry> {
  if (profileHistory.length === 0) return [...ownHistory];

  const newest = Math.max(...profileHistory.map((entry) => entry.date.getTime()));
  const fresh = ownHistory.filter((entry) => entry.date.getTime() - newest > SAME_FIGHT_WINDOW_MS);
  return [...fresh, ...profileHistory];
}
