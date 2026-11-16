import type { Metadata } from "next";

export const revalidate = 86400;

import { PageHero } from "@/components/page-hero";
import { getLocale } from "@/lib/i18n";
import { buildPageMetadata } from "@/lib/page-metadata";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();

  return buildPageMetadata({
    locale,
    path: "/about",
    title: locale === "ru" ? "О FightBase Media" : "About FightBase Media",
    description:
      locale === "ru"
        ? "FightBase — сайт о UFC на русском: новости, расписание турниров, прогнозы на бои, рейтинги и карточки бойцов."
        : "About FightBase Media: our editorial approach to UFC news, analysis, events, and fighter profiles."
  });
}

export default async function AboutPage() {
  const locale = await getLocale();

  return (
    <main className="container">
      <PageHero
        eyebrow="/about"
        title={locale === "ru" ? "О FightBase" : "About FightBase"}
        description={
          locale === "ru"
            ? "Сайт о UFC на русском языке: новости, расписание и карды турниров, прогнозы на бои, официальные рейтинги и карточки бойцов."
            : "FightBase Media is a UFC-focused publication where news, event pages, fighter profiles, rankings, and previews live in one editorial system."
        }
      />

      <section className="feature-grid">
        <article className="feature-card editorial-card">
          <p className="eyebrow">{locale === "ru" ? "Новости" : "Positioning"}</p>
          <h3>{locale === "ru" ? "Откуда новости" : "Not an aggregator, but an editorial product"}</h3>
          <p className="copy">
            {locale === "ru"
              ? "Новости выходят по материалам изданий о ММА, в основном Sherdog и MMA Fighting, и по сообщениям UFC. Под заголовком каждой новости стоит ссылка на материал, по которому она написана."
              : "FightBase is built as a UFC publication rather than a stream of disconnected rewrites. Each section should explain what happened, why it matters, and where to go next."}
          </p>
        </article>
        <article className="feature-card editorial-card">
          <p className="eyebrow">{locale === "ru" ? "Данные" : "Structure"}</p>
          <h3>{locale === "ru" ? "Рейтинги, результаты, статистика" : "News, fighters, and events are connected"}</h3>
          <p className="copy">
            {locale === "ru"
              ? "Рейтинги сверяем с UFC.com каждый день. Результаты боёв и статистика бойцов приходят из ESPN и UFC.com, коэффициенты считаем как среднее по нескольким букмекерам."
              : "Stories are tied to fighters and events, event pages lead into prediction pages, and fighter profiles collect stats, recent bouts, and related coverage."}
          </p>
        </article>
        <article className="feature-card editorial-card">
          <p className="eyebrow">{locale === "ru" ? "Прогнозы" : "Focus"}</p>
          <h3>{locale === "ru" ? "Прогнозы и их проверка" : "UFC as one connected beat"}</h3>
          <p className="copy">
            {locale === "ru"
              ? "Прогноз на каждый бой делает ИИ-модель FightBase за два-три дня до турнира. Пик записывается до начала боёв и потом не меняется. Сколько пиков сыграло, видно на странице точности прогнозов."
              : "The site currently focuses on UFC to keep coverage deeper, cleaner, and more tightly connected."}
          </p>
        </article>
      </section>
    </main>
  );
}
