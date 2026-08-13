import type { Locale } from "@/lib/locale-config";

const FIGHT_STAGE_ORDER: Record<string, number> = {
  main_card: 0,
  prelims: 1,
  early_prelims: 2
};

export type FightCardSortable = {
  id: string;
  stage?: string | null;
  boutOrder?: number | null;
  isMainEvent?: boolean | null;
  createdAt?: Date | string | null;
};

function compareNullableNumbers(left: number | null | undefined, right: number | null | undefined) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return left - right;
}

function toTimestamp(value: Date | string | null | undefined) {
  if (!value) return Number.POSITIVE_INFINITY;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

export function compareFightsForCard(left: FightCardSortable, right: FightCardSortable) {
  const mainEventOrder = Number(Boolean(right.isMainEvent)) - Number(Boolean(left.isMainEvent));
  if (mainEventOrder !== 0) return mainEventOrder;

  const stageOrder = (FIGHT_STAGE_ORDER[left.stage ?? ""] ?? 99) - (FIGHT_STAGE_ORDER[right.stage ?? ""] ?? 99);
  if (stageOrder !== 0) return stageOrder;

  const boutOrder = compareNullableNumbers(left.boutOrder, right.boutOrder);
  if (boutOrder !== 0) return boutOrder;

  const createdAtOrder = toTimestamp(left.createdAt) - toTimestamp(right.createdAt);
  if (createdAtOrder !== 0) return createdAtOrder;

  return left.id.localeCompare(right.id);
}

export function sortFightsForCard<T extends FightCardSortable>(fights: readonly T[]) {
  return [...fights].sort(compareFightsForCard);
}

export function getMainEventFight<T extends FightCardSortable>(fights: readonly T[]) {
  return sortFightsForCard(fights)[0] ?? null;
}

export function formatWinnerlessFightResult(resultType: string | null | undefined, locale: Locale) {
  if (resultType === "draw") {
    return locale === "ru" ? "Ничья" : "Draw";
  }

  if (resultType === "no_contest") {
    return locale === "ru" ? "Бой признан несостоявшимся (NC)" : "No contest (NC)";
  }

  return locale === "ru" ? "Результат уточняется" : "Result pending verification";
}
