// Вердикт архивного прогноза: сбылся ли пик (боец с большим процентом) после боя.

export type PredictionVerdict = "pending" | "correct" | "wrong" | "no_result";

export function resolvePredictionVerdict(input: {
  percentA: number;
  percentB: number;
  fighterAId: string;
  fighterBId: string;
  status: string | null | undefined;
  resultType: string | null | undefined;
  winnerFighterId: string | null | undefined;
}): PredictionVerdict {
  if (input.status !== "completed") {
    return "pending";
  }

  if (input.resultType !== "win" || !input.winnerFighterId || input.percentA === input.percentB) {
    return "no_result";
  }

  const predictedWinnerId = input.percentA > input.percentB ? input.fighterAId : input.fighterBId;
  return predictedWinnerId === input.winnerFighterId ? "correct" : "wrong";
}
