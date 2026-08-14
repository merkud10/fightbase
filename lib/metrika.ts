// Цели Яндекс.Метрики. Вызывается только из клиентских компонентов; на сервере — no-op.
// Имена целей регистрируются в кабинете Метрики как «JavaScript-событие»:
// push_subscribe_click, social_telegram_click, social_vk_click,
// share_telegram, share_vk, share_copy.

export function reachMetrikaGoal(goal: string) {
  if (typeof window === "undefined") {
    return;
  }

  const id = Number((process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID || "108511042").trim());
  const ym = (window as unknown as { ym?: (id: number, action: string, goal: string) => void }).ym;

  if (id && typeof ym === "function") {
    ym(id, "reachGoal", goal);
  }
}
