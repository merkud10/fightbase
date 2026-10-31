import Link from "next/link";
import { MetrikaInternalLink } from "@/components/metrika-goal-link";

import { buildCardPredictionRows, type CardPredictionFight, type CardPredictionState } from "@/lib/card-predictions";
import { formatWeightClass, getDisplayName } from "@/lib/display";
import { pickPendingText } from "@/lib/event-picks";
import { formatWinnerlessFightResult } from "@/lib/fight-card";
import type { Locale } from "@/lib/locale-config";
import { localizePath } from "@/lib/locale-path";

type Fighter = { id: string; name: string; nameRu: string | null };

type CardFight = CardPredictionFight & {
  weightClass: string;
  fighterA: Fighter;
  fighterB: Fighter;
};

function describeState(state: CardPredictionState, fighterA: Fighter, fighterB: Fighter, locale: Locale) {
  const nameOf = (side: "A" | "B") => getDisplayName(side === "A" ? fighterA : fighterB, locale);
  const pickWord = locale === "ru" ? "пик" : "pick";
  switch (state.kind) {
    case "pick":
      return (
        <>
          {locale === "ru" ? "Пик: " : "Pick: "}
          <strong>{nameOf(state.side)}</strong> · {state.percent}%
        </>
      );
    case "pending":
      return pickPendingText(locale, "short");
    case "result":
      return (
        <>
          {locale === "ru" ? "Победа: " : "Winner: "}
          <strong>{nameOf(state.winnerSide)}</strong>
          {state.pickVerdict === "correct" ? ` · ${pickWord} ✓` : state.pickVerdict === "wrong" ? ` · ${pickWord} ✗` : ""}
        </>
      );
    case "winnerless":
      return formatWinnerlessFightResult(state.resultType, locale);
  }
}

// Блок «Другие прогнозы на кард» на странице прогноза: ведёт читателя к
// следующему бою турнира. Нет других боёв с прогнозом — блока нет.
export function CardPredictionsList({
  fights,
  currentFightId,
  event,
  locale
}: {
  fights: readonly CardFight[];
  currentFightId: string;
  event: { slug: string; name: string };
  locale: Locale;
}) {
  const rows = buildCardPredictionRows(fights, currentFightId);
  if (rows.length === 0) return null;

  return (
    <section className="prediction-section-card card-predictions" aria-labelledby="card-predictions-title">
      <h3 id="card-predictions-title">
        {locale === "ru" ? `Другие прогнозы на ${event.name}` : `More predictions for ${event.name}`}
      </h3>
      <div className="event-fight-list">
        {rows.map(({ fight, state }) => (
          <MetrikaInternalLink
            goal="prediction_next_click"
            key={fight.id}
            href={localizePath(`/predictions/${event.slug}/${fight.slug}`, locale)}
            className="event-fight-row card-predictions-row"
          >
            <span className="event-fight-copy">
              <strong>
                {getDisplayName(fight.fighterA, locale)} — {getDisplayName(fight.fighterB, locale)}
              </strong>
              <span>
                {fight.isMainEvent ? (locale === "ru" ? "Главный бой · " : "Main event · ") : ""}
                {formatWeightClass(fight.weightClass, locale)}
              </span>
            </span>
            <span className="event-table-pick">{describeState(state, fight.fighterA, fight.fighterB, locale)}</span>
          </MetrikaInternalLink>
        ))}
      </div>
      <Link href={localizePath(`/events/${event.slug}`, locale)} className="event-table-link">
        {locale === "ru" ? "Весь кард и время по Москве →" : "Full card and start times →"}
      </Link>
    </section>
  );
}
