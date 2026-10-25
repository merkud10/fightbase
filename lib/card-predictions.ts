// Строки блока «Другие прогнозы на кард» на странице прогноза: остальные бои
// турнира со страницей прогноза, в порядке карда, с пиком модели или итогом.
// Пик и вердикт считает describeFightPick — тот же, что в таблице карда на
// странице турнира, чтобы обе страницы показывали одно и то же.

import { describeFightPick } from "@/lib/event-picks";
import { sortFightsForCard, type FightCardSortable } from "@/lib/fight-card";

export type CardPredictionFight = FightCardSortable & {
  slug: string | null;
  status: string;
  resultType: string | null;
  winnerFighterId: string | null;
  fighterAId: string;
  fighterBId: string;
  fighterA: { id: string };
  fighterB: { id: string };
  predictionSnapshot: { aiPickFighterId: string | null; percentA: number; percentB: number } | null;
};

export type CardPredictionState =
  | { kind: "pick"; side: "A" | "B"; percent: number }
  | { kind: "pending" }
  | { kind: "result"; winnerSide: "A" | "B"; pickVerdict: "correct" | "wrong" | null }
  | { kind: "winnerless"; resultType: string | null };

export type CardPredictionRow<T extends CardPredictionFight> = { fight: T & { slug: string }; state: CardPredictionState };

function resolveState(fight: CardPredictionFight): CardPredictionState {
  const pick = describeFightPick(fight);
  if (fight.status !== "completed") {
    return pick ? { kind: "pick", side: pick.side, percent: pick.percent } : { kind: "pending" };
  }
  if (fight.resultType === "win" && fight.winnerFighterId) {
    const pickVerdict = pick?.verdict === "correct" || pick?.verdict === "wrong" ? pick.verdict : null;
    return { kind: "result", winnerSide: fight.winnerFighterId === fight.fighterAId ? "A" : "B", pickVerdict };
  }
  return { kind: "winnerless", resultType: fight.resultType };
}

export function buildCardPredictionRows<T extends CardPredictionFight>(
  fights: readonly T[],
  currentFightId: string
): CardPredictionRow<T>[] {
  return sortFightsForCard(fights)
    .filter(
      (fight): fight is T & { slug: string } =>
        fight.id !== currentFightId && Boolean(fight.slug) && Boolean(fight.predictionSnapshot)
    )
    .map((fight) => ({ fight, state: resolveState(fight) }));
}
