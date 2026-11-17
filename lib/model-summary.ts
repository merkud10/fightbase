// Данные для картинки-сводки после турнира (lib/model-summary-image.tsx): счёт
// модели на турнире, отметки по боям, столбики последних турниров и общий итог.
// Вердикты считают те же функции, что сайт и посты, чтобы цифры не расходились.

import { surname } from "@/lib/event-seo";
import { sortFightsForCard } from "@/lib/fight-card";
import { barHeightPercent, compactEventLabel } from "@/lib/prediction-chart";
import { resolveAiPickVerdict, resolvePredictionVerdict } from "@/lib/prediction-verdict";
import type { TelegramPicksEvent } from "@/lib/telegram-picks";

type Tally = { correct: number; judged: number };

export type ModelSummaryAccuracy = {
  eventsCount: number;
  events: Array<{ slug: string; name: string; date: Date | string; model: Tally; favorite: Tally }>;
  model: Tally & { percent: number | null };
  modelRoi: { units: number; staked: number; percent: number | null };
};

export type ModelSummaryMark = "hit" | "miss" | "void";

export type ModelSummary = {
  title: string;
  dateLabel: string;
  model: Tally;
  favorite: Tally;
  marks: ModelSummaryMark[];
  chart: Array<{
    label: string;
    dateLabel: string;
    current: boolean;
    model: Tally;
    modelHeight: number | null;
    favoriteHeight: number | null;
  }>;
  totals: {
    eventsCount: number;
    percent: number | null;
    correct: number;
    judged: number;
    bankroll: string | null;
    bankrollUp: boolean;
  };
};

// «UFC 334: Gane vs. Hokit» → «UFC 334: Ган — Хокит»: по-русски, по главному бою.
function summaryTitle(event: TelegramPicksEvent) {
  const main = sortFightsForCard(event.fights)[0];
  const placeholder = (name: string) => /^(opponent\s+)?(tba|tbd)$/i.test(name.trim());
  const sideName = (fighter: { name: string; nameRu?: string | null }) => fighter.nameRu ?? fighter.name;
  if (!main || placeholder(main.fighterA.name) || placeholder(main.fighterB.name)) return event.name;

  const pair = `${surname(sideName(main.fighterA))} — ${surname(sideName(main.fighterB))}`;
  const prefix = event.name.includes(":") ? event.name.split(":")[0]!.trim() : event.name.trim();
  return `${prefix}: ${pair}`;
}

function formatBankroll(units: number) {
  const number = Math.abs(units).toFixed(2).replace(".", ",");
  return `${units > 0 ? "+" : units < 0 ? "−" : ""}${number}`;
}

export function buildModelSummary(event: TelegramPicksEvent, accuracy: ModelSummaryAccuracy): ModelSummary {
  const fights = sortFightsForCard(event.fights.filter((fight) => fight.status === "completed"));
  const model: Tally = { correct: 0, judged: 0 };
  const favorite: Tally = { correct: 0, judged: 0 };
  const marks: ModelSummaryMark[] = [];

  for (const fight of fights) {
    const snapshot = fight.predictionSnapshot;
    if (!snapshot) continue;
    const outcome = { status: fight.status, resultType: fight.resultType, winnerFighterId: fight.winnerFighterId };
    const modelVerdict = resolveAiPickVerdict({ aiPickFighterId: snapshot.aiPickFighterId, ...outcome });
    const favoriteVerdict = resolvePredictionVerdict({
      percentA: snapshot.percentA,
      percentB: snapshot.percentB,
      fighterAId: fight.fighterAId,
      fighterBId: fight.fighterBId,
      ...outcome
    });
    for (const [bucket, verdict] of [[model, modelVerdict], [favorite, favoriteVerdict]] as const) {
      if (verdict === "correct" || verdict === "wrong") bucket.judged += 1;
      if (verdict === "correct") bucket.correct += 1;
    }
    marks.push(modelVerdict === "correct" ? "hit" : modelVerdict === "wrong" ? "miss" : "void");
  }

  const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const shortDate = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

  return {
    title: summaryTitle(event),
    dateLabel: dateFormat.format(event.date).replace(/\s*г\.$/, ""),
    model,
    favorite,
    marks,
    chart: accuracy.events
      .filter((item) => item.model.judged > 0 || item.favorite.judged > 0)
      .map((item) => ({
        label: compactEventLabel(item.name),
        dateLabel: shortDate.format(new Date(item.date)),
        current: item.slug === event.slug,
        model: item.model,
        modelHeight: barHeightPercent(item.model),
        favoriteHeight: barHeightPercent(item.favorite)
      })),
    totals: {
      eventsCount: accuracy.eventsCount,
      percent: accuracy.model.percent,
      correct: accuracy.model.correct,
      judged: accuracy.model.judged,
      bankroll: accuracy.modelRoi.percent !== null ? formatBankroll(accuracy.modelRoi.units) : null,
      bankrollUp: accuracy.modelRoi.units > 0
    }
  };
}
