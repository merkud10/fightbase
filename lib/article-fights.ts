// Подбор боёв для блока «Прогноз FightBase на этот бой» в статье: бои бойцов из
// материала, у которых есть снапшот прогноза. Сначала бои, где встречаются двое
// упомянутых, затем ближайшие предстоящие, затем недавно завершённые (до двух
// недель), чтобы новость «после боя» вела на страницу с итогом пика.

export type ArticleFightCandidate = {
  id: string;
  fighterAId: string;
  fighterBId: string;
  status: string;
  eventDate: Date;
};

const RECENT_COMPLETED_DAYS = 14;
const MAX_FIGHTS = 3;

export function selectArticleFights<T extends ArticleFightCandidate>(
  fights: readonly T[],
  articleFighterIds: readonly string[],
  now: Date = new Date()
): T[] {
  const ids = new Set(articleFighterIds);
  const recentThreshold = now.getTime() - RECENT_COMPLETED_DAYS * 24 * 60 * 60 * 1000;

  const ranked = fights
    .map((fight) => {
      const mentioned = Number(ids.has(fight.fighterAId)) + Number(ids.has(fight.fighterBId));
      const upcoming = fight.status === "scheduled";
      const completed = fight.status === "completed";
      return { fight, mentioned, upcoming, completed };
    })
    .filter(({ fight, mentioned, upcoming, completed }) => {
      if (mentioned === 0) return false;
      if (upcoming) return true;
      return completed && fight.eventDate.getTime() >= recentThreshold;
    })
    .sort((left, right) => {
      if (left.mentioned !== right.mentioned) return right.mentioned - left.mentioned;
      if (left.upcoming !== right.upcoming) return left.upcoming ? -1 : 1;
      const delta = left.fight.eventDate.getTime() - right.fight.eventDate.getTime();
      // Предстоящие — от ближайшего, завершённые — от самого свежего.
      return left.upcoming ? delta : -delta;
    });

  const seen = new Set<string>();
  const result: T[] = [];
  for (const { fight } of ranked) {
    if (seen.has(fight.id)) continue;
    seen.add(fight.id);
    result.push(fight);
    if (result.length >= MAX_FIGHTS) break;
  }
  return result;
}
