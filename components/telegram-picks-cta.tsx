import { MetrikaGoalLink } from "@/components/metrika-goal-link";
import type { Locale } from "@/lib/locale-config";

// Призыв в Telegram-канал на страницах прогнозов: канал за 2–3 дня до турнира
// закрепляет пики на весь кард (lib/telegram-picks-runner.ts).
export function TelegramPicksCta({ locale, className = "policy-card" }: { locale: Locale; className?: string }) {
  const telegramUrl = process.env.NEXT_PUBLIC_TELEGRAM_URL?.trim() || "";
  if (!telegramUrl || telegramUrl === "https://t.me/" || telegramUrl === "https://t.me") {
    return null;
  }

  const isRu = locale === "ru";
  return (
    <section className={className} aria-label={isRu ? "Пики в Telegram" : "Picks on Telegram"}>
      <h3>{isRu ? "Пики на весь кард — в Telegram" : "Full-card picks on Telegram"}</h3>
      <p className="copy">
        {isRu
          ? "За 2–3 дня до турнира закрепляем в канале пики ИИ-модели FightBase на все бои карда. Между турнирами — главные новости UFC."
          : "2–3 days before each event we pin the FightBase AI picks for every bout on the card. Between events — the main UFC news."}
      </p>
      <div className="home-follow-row">
        <MetrikaGoalLink href={telegramUrl} goal="prediction_telegram_click" className="button" ariaLabel="FightBase Telegram">
          {isRu ? "Подписаться" : "Subscribe"}
        </MetrikaGoalLink>
      </div>
    </section>
  );
}
