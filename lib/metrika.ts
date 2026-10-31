// Цели Яндекс.Метрики. Вызывается только из клиентских компонентов; на сервере — no-op.
// Имена целей регистрируются в кабинете Метрики как «JavaScript-событие»:
// push_subscribe_click, social_telegram_click, social_vk_click,
// share_telegram, share_vk, share_copy, prediction_telegram_click,
// home_prediction_click, home_event_click,
// event_prediction_click, prediction_next_click (нажатия, не подтверждённые загрузки).

import { METRIKA_ID } from "./metrika-config";

export function reachMetrikaGoal(goal: string) {
  if (typeof window === "undefined") {
    return;
  }

  const id = METRIKA_ID;
  const ym = (window as unknown as { ym?: (id: number, action: string, goal: string) => void }).ym;

  if (id && typeof ym === "function") {
    ym(id, "reachGoal", goal);
  }
}
