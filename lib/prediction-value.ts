// «Ценный выбор» ИИ-модели FightBase: сторона, на которую ставка выгодна
// математически. Пик отвечает на вопрос «кто победит», а ценный выбор — «где
// линия недооценивает бойца»: фаворит 1.30 при оценке модели 70% убыточен
// (0.70 × 1.30 − 1 = −9%), андердог 3.00 при оценке 40% — нет (+20%).
//
// Считается из оценки модели (aiWinChanceA) и кэфов, зафиксированных на момент
// пика; оба значения в снапшоте не меняются, поэтому выбор не подгоняется
// задним числом.

// Ниже этого перевеса выбор не делаем: оценка модели шумная, и тонкий
// расчётный перевес съедается её ошибкой.
export const VALUE_EDGE_MIN = 0.05;

export type ValuePick = {
  side: "A" | "B";
  fighterId: string;
  odds: number;
  modelChance: number;
  edge: number;
};

export function expectedValue(chance: number, odds: number) {
  return chance * odds - 1;
}

export function resolveValuePick(input: {
  aiWinChanceA: number | null | undefined;
  oddsAAtPick: number | null | undefined;
  oddsBAtPick: number | null | undefined;
  fighterAId: string;
  fighterBId: string;
}): ValuePick | null {
  const { aiWinChanceA, oddsAAtPick: oddsA, oddsBAtPick: oddsB } = input;
  if (aiWinChanceA == null || !(aiWinChanceA > 0 && aiWinChanceA < 100)) return null;
  if (oddsA == null || oddsB == null || !(oddsA > 1) || !(oddsB > 1)) return null;

  const chanceA = aiWinChanceA / 100;
  const edgeA = expectedValue(chanceA, oddsA);
  const edgeB = expectedValue(1 - chanceA, oddsB);
  const side = edgeA >= edgeB ? "A" : "B";
  const edge = side === "A" ? edgeA : edgeB;
  if (edge < VALUE_EDGE_MIN) return null;

  return {
    side,
    fighterId: side === "A" ? input.fighterAId : input.fighterBId,
    odds: side === "A" ? oddsA : oddsB,
    modelChance: side === "A" ? aiWinChanceA : 100 - aiWinChanceA,
    edge
  };
}

// Результат ценного выбора как виртуальной ставки в 1 у.е. по кэфу на момент
// пика; бои без чистой победы в расчёт не входят.
export function resolveValueUnits(
  valuePick: ValuePick | null,
  fight: { status: string | null | undefined; resultType: string | null | undefined; winnerFighterId: string | null | undefined }
): number | null {
  if (!valuePick || fight.status !== "completed" || fight.resultType !== "win" || !fight.winnerFighterId) return null;
  return fight.winnerFighterId === valuePick.fighterId ? valuePick.odds - 1 : -1;
}
