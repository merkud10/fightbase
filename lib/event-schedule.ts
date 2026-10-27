// Таблица «Расписание UFC (ЮФС)» вверху хаба /events: все предстоящие и идущие
// турниры одной таблицей, от ближайшего. По GSC (октябрь 2026) хаб искали как
// «юфс расписание», «ближайшие бои ufc», «ufc предстоящие бои», а страница
// показывала крупные карточки вперемешку с прошедшими турнирами апреля.

import { getMainEventFight, type FightCardSortable } from "@/lib/fight-card";

type ScheduleEvent = {
  status: string;
  date: Date;
  fights: readonly FightCardSortable[];
};

export function buildScheduleRows<E extends ScheduleEvent>(events: readonly E[]) {
  return events
    .filter((event) => event.status === "upcoming" || event.status === "live")
    .sort((left, right) => left.date.getTime() - right.date.getTime())
    .map((event, index) => ({
      event,
      mainFight: getMainEventFight(event.fights) as E["fights"][number] | null,
      isNext: index === 0
    }));
}

// Блок «Ближайшие турниры» на странице турнира. По Метрике (октябрь 2026) со
// страниц турниров уходили сразу 45% живых посетителей против 13% на прогнозах:
// далёкий UFC 335 с пустым кардом и прошедшие турниры отвечали на запрос, но
// ссылок на другие турниры со страницы не было вовсе.
export function buildNearbyEvents<
  E extends Omit<ScheduleEvent, "fights"> & {
    slug: string;
    fights: readonly (FightCardSortable & { predictionSnapshot?: { aiPickFighterId: string | null } | null })[];
  }
>(currentSlug: string, events: readonly E[], limit = 3) {
  // «Ближайший» считается по всему расписанию: на странице самого ближайшего
  // турнира следующий за ним ближайшим не станет. Готовый пик — как в
  // summarizeEventPicks: снимок без aiPickFighterId — заготовка разбора, пика ещё нет.
  return buildScheduleRows<E>(events)
    .filter((row) => row.event.slug !== currentSlug)
    .slice(0, limit)
    .map((row) => ({
      ...row,
      picksReady: row.event.fights.filter((fight) => fight.predictionSnapshot?.aiPickFighterId).length
    }));
}
