type HistoryEntry = { date: Date; opponentSlug: string | null };
type FightCandidate = {
  fighterAId: string;
  fighterBId: string;
  fighterA: { slug: string };
  fighterB: { slug: string };
  status: string;
  slug: string | null;
  event: { slug: string; date: Date };
  predictionSnapshot: { id: string } | null;
};

// Prefer missing links to linking a rematch or an ambiguous imported record.
// Date-only history and event timestamps must share the same UTC calendar day.
export function resolveFighterHistoryLinks(entry: HistoryEntry, fighterId: string, fights: FightCandidate[]) {
  const empty = { eventSlug: null, predictionSlug: null };
  if (!entry.opponentSlug || !Number.isFinite(entry.date.getTime())) return empty;
  const day = entry.date.toISOString().slice(0, 10);
  const matches = fights.filter((fight) => {
    const opponent = fight.fighterAId === fighterId ? fight.fighterB
      : fight.fighterBId === fighterId ? fight.fighterA : null;
    return fight.status === "completed" && opponent?.slug === entry.opponentSlug
      && Number.isFinite(fight.event.date.getTime())
      && fight.event.date.toISOString().slice(0, 10) === day;
  });
  if (matches.length !== 1 || !matches[0]!.event.slug) return empty;
  const fight = matches[0]!;
  return {
    eventSlug: fight.event.slug,
    predictionSlug: fight.predictionSnapshot && fight.slug ? fight.slug : null
  };
}
