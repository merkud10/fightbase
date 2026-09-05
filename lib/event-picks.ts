// Сводка пиков ИИ-модели FightBase по карду турнира: сколько боёв с пиком,
// сколько уже рассужено и сколько угадано. Для завершённых турниров — блок
// «Итоги», для предстоящих — строка «пики готовы на N из M боёв».

import { resolveAiPickVerdict } from "@/lib/prediction-verdict";

type PickableFight = {
  status: string;
  resultType: string | null;
  winnerFighterId: string | null;
  fighterAId: string;
  fighterBId: string;
  predictionSnapshot: { aiPickFighterId: string | null; percentA: number; percentB: number } | null;
};

export type EventPickSummary = { fights: number; withPicks: number; judged: number; correct: number; upsets: number };

export function summarizeEventPicks(fights: readonly PickableFight[]): EventPickSummary {
  const summary: EventPickSummary = { fights: fights.length, withPicks: 0, judged: 0, correct: 0, upsets: 0 };
  for (const fight of fights) {
    const snapshot = fight.predictionSnapshot;
    if (!snapshot?.aiPickFighterId) continue;
    summary.withPicks += 1;
    const verdict = resolveAiPickVerdict({
      aiPickFighterId: snapshot.aiPickFighterId,
      status: fight.status,
      resultType: fight.resultType,
      winnerFighterId: fight.winnerFighterId
    });
    if (verdict === "correct" || verdict === "wrong") summary.judged += 1;
    if (verdict === "correct") {
      summary.correct += 1;
      const favoriteId = snapshot.percentA === snapshot.percentB ? null : snapshot.percentA > snapshot.percentB ? fight.fighterAId : fight.fighterBId;
      if (favoriteId && favoriteId !== snapshot.aiPickFighterId) summary.upsets += 1;
    }
  }
  return summary;
}

// Пик по конкретному бою для таблицы карда: кого выбрала модель, с каким
// процентом и чем это кончилось.
export function describeFightPick<T extends PickableFight & { fighterA: { id: string }; fighterB: { id: string } }>(fight: T) {
  const snapshot = fight.predictionSnapshot;
  if (!snapshot?.aiPickFighterId) return null;
  const pickIsA = snapshot.aiPickFighterId === fight.fighterA.id;
  const pickIsB = snapshot.aiPickFighterId === fight.fighterB.id;
  if (!pickIsA && !pickIsB) return null;
  const verdict = resolveAiPickVerdict({
    aiPickFighterId: snapshot.aiPickFighterId,
    status: fight.status,
    resultType: fight.resultType,
    winnerFighterId: fight.winnerFighterId
  });
  return {
    side: pickIsA ? ("A" as const) : ("B" as const),
    percent: pickIsA ? snapshot.percentA : snapshot.percentB,
    verdict
  };
}
