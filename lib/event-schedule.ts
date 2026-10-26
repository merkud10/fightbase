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
